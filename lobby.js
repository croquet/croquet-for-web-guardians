import * as Croquet from "@croquet/worldcore-kernel";
import apiKey from "./apiKey";
import buttonFail from "./assets/Audio/ShootFail.wav";
import engineStart from "./assets/Audio/avatarEnter.wav";

// Lobby is a simple session manager for Croquet apps.
// When a user joins the lobby, they see a list of sessions.
// They can join a session by clicking on it, which loads the app in an iframe.
// The app needs to continuously report its users via the "croquet-lobby" message.
// Only one user of the app session also stays in the lobby session, to keep the user
// count in the lobby low. See LobbyRelay in src/Actors.js and src/Pawns.js for an example.

// TODO
// [x] list sessions
// [x] new session button
// [x] single view as relay
// [ ] show debug badge of game not lobby
// [ ] hierarchical lobby sessions
// [ ] unlisted sessions (join directly by name)
// [ ] lobby/session password (?)

// redirect old session links to lobby
if (window.location.search.includes("q=")) {
    window.location.href = window.location.href.replace(/\?.*$/, "");
}

const BaseUrl = window.location.href.replace(/[^/?#]*([?#].*)?$/, "");
Croquet.Constants.AppUrl = BaseUrl + "game.html";

let appname = window.location.pathname.match(/([^/]+)\/$/, "$1");
if (appname) {
    appname = appname[1].replace(/^./, c => c.toUpperCase());
    document.title = appname + " Lobby";
} else {
    appname = document.title.replace(/\bLobby\b/, "").trim() || "Croquet";
}

let appSessionName = window.location.hash.slice(1);
try { appSessionName = decodeURIComponent(appSessionName) } catch (e) { /* ignore */ }

const SESSION_TIMEOUT = 5; // seconds
export const MAX_USERS = 8; // max users in a session

class Lobby extends Croquet.Model {

    init(_, persisted = {}) {
        this.sessions = new Map();
        this.views = new Map();
        this.subscribe(this.sessionId, "view-join", this.viewJoined);
        this.subscribe(this.sessionId, "view-exit", this.viewExited);
        this.subscribe(this.sessionId, "in-app-session", this.inAppSession);
        this.initStats(persisted);
    }

    ensureSession(name, since) {
        let session = this.sessions.get(name);
        if (!session) {
            session = {
                name,
                users: "",
                views: new Set(),
                relay: null,
                since,
                lastActive: 0,
                timeout: null,
            };
            this.sessions.set(name, session);
            this.numSessions++;
            this.recordStats();
        }
        return session;
    }

    viewJoined(viewId) {
        this.views.set(viewId, {
            viewId,
            session: null,
        });
        this.recordStats();
        console.log("lobby", this.now(), "view joined", viewId, [...this.views.keys()]);
    }

    viewExited(viewId) {
        const view = this.views.get(viewId);
        this.views.delete(viewId);
        const session = view.session;
        if (session) {
            session.views.delete(view);
            const count = typeof session.users.count === "number" ? session.users.count : parseInt(session.users, 10);
            if (count === 1) {
                // last user in session, expire it right away
                this.sessionExpired(session);
            } else if (session.relay === view) {
                session.relay = null;
                // renew the session timeout, hope another relay appears
                this.sessionActive(session);
            }
            // if there were more than one user, the session will expire on its own
        }
        console.log("lobby", this.now(), "view exited", viewId, [...this.views.values()]
            .map(v => `${v.viewId} ${v.session ? v.session.name : "in lobby"}`));
    }

    inAppSession({ viewId, name, now, users }) {
        const view = this.views.get(viewId);
        if (view.session && view.session.name !== name) {
            console.warn("lobby", this.now(), "view changed session", viewId, view.session.name, name);
            view.session.views.delete(view);
        }
        const session = this.ensureSession(name, now);
        session.lastActive = this.now();
        session.users = users;
        if (!session.views.has(view)) {
            session.views.add(view);
            view.session = session;
        }
        if (session.relay !== view) {
            session.relay = view;
            this.publish(this.sessionId, "relay-changed", { name, viewId });
            console.log("lobby", this.now(), "relay changed", name, viewId);
        }
        this.sessionActive(session);
        this.publish(this.sessionId, "session-changed", name);
        this.recordStats(now);
        // console.log("lobby", this.now(), "in app session", session.name, users, [...session.views].map(v => v.viewId));
    }


    sessionActive(session) {
        if (session.timeout) this.cancelFuture(session.timeout);
        session.timeout = this.future(SESSION_TIMEOUT * 1000).sessionExpired(session);
    }

    sessionExpired(session) {
        for (const view of session.views) {
            view.session = null;
        }
        if (session.timeout) this.cancelFuture(session.timeout);
        this.sessions.delete(session.name);
        this.publish(this.sessionId, "session-changed", session.name);
        console.log("lobby", this.now(), "session expired", session.name);
    }

    ////////////////////////////////////////////////////////////////////////////
    // Historic Stats
    //
    // okay this is more complex than the whole rest of the lobby combined
    // and strictly for our own amusement. Feel free to ignore. -- @codefrau
    ////////////////////////////////////////////////////////////////////////////

    initStats(persisted) {
        this.stats = {
            // current date's stats
            current: this.newStats(),
            // history of stats
            history: persisted.history || [],
            prehistoricSessions: persisted.prehistoricSessions ||0, // number of sessions that fell off the end of history
        };
        // update older history items with new fields
        for (const item of this.stats.history) {
            if (!item.maxInSession) item.maxInSession = 1;
            if (!item.numSessions || item.maxSessions > item.numSessions) item.numSessions = item.maxSessions;
        }
        this.numSessions = 0;
    }

    newStats(date=0) {
        return {
            maxInLobby: 0,      // max users in lobby at once
            maxInSessions: 0,   // max users in all sessions at once
            maxInSession: 0,    // max users in a single session
            maxSessions: 0,     // max sessions at once
            numSessions: 0,     // number of sessions
            date,
        };
    }

    recordStats(now = 0) {
        let changed = false;
        if (now) {
            // keep one entry per day
            const date = now - now % (24 * 60 * 60 * 1000);
            if (date !== this.stats.current.date) {
                if (!this.stats.current.date) {
                    // first time we have a date, see if we have any history for it
                    const existing = this.stats.history.find(entry => entry.date === date);
                    if (existing) {
                        // merge current stats into existing and use that
                        for (const key in existing) {
                            if (key.startsWith("max") && this.stats.current[key] > existing[key]) {
                                existing[key] = this.stats.current[key];
                            }
                        }
                        existing.numSessions += this.numSessions;
                        this.stats.current = existing;
                    } else  {
                        // no history, just save current stats
                        this.stats.current.date = date;
                        this.stats.history.push(this.stats.current);
                    }
                } else {
                    // new day, save current stats and start new
                    this.stats.history.push(this.stats.current);
                    this.stats.current = this.newStats(date);
                    this.numSessions = 0;
                }
                // limit history to 100 entries, but keep the ones for largest stats
                if (this.stats.history.length > 100) {
                    const keep = new Set(this.maxStats().values());
                    // delete oldest entry that is not in keep
                    const oldestIndex = this.stats.history.findIndex(entry => !keep.has(entry));
                    const item = this.stats.history.splice(oldestIndex, 1)[0];
                    this.stats.prehistoricSessions += item.numSessions; // count sessions that fell off the end of history
                }
                changed = true;
            }
        }
        if (this.views.size > this.stats.current.maxInLobby) {
            this.stats.current.maxInLobby = this.views.size;
            changed = true;
        }
        if (this.sessions.size > this.stats.current.maxSessions) {
            this.stats.current.maxSessions = this.sessions.size;
            changed = true;
        }
        if (this.numSessions > this.stats.current.numSessions) {
            this.stats.current.numSessions = this.numSessions;
            changed = true;
        }
        let sumInSessions = 0;
        let maxInSession = 0;
        for (const session of this.sessions.values()) {
            const count = typeof session.users.count === "number" ? session.users.count : parseInt(session.users, 10);
            sumInSessions += count;
            if (count > maxInSession) maxInSession = count;
        }
        if (sumInSessions > this.stats.current.maxInSessions) {
            this.stats.current.maxInSessions = sumInSessions;
            changed = true;
        }
        if (maxInSession > this.stats.current.maxInSession) {
            this.stats.current.maxInSession = maxInSession;
            changed = true;
        }
        if (changed && this.stats.history.length > 0) {
            this.persistSession({
                history: this.stats.history,
                prehistoricSessions: this.stats.prehistoricSessions,
            });
            // console.log("lobby", this.now(), "stats", this.stats);
        }
    }

    maxStats() {
        // gather entries for largest individual stats
        // NOTE: this is also called directly from view code, don't modify anything here!!!
        const maxItems = new Map();
        if (this.stats.history.length > 0) {
            for (const key of ["maxInLobby", "maxInSessions", "maxInSession", "maxSessions", "numSessions"]) {
                maxItems.set(key, this.stats.history.reduce(
                    (largest, entry) => entry[key] > largest[key] ||
                        entry[key] === largest[key] && entry.date < largest.date
                        ? entry : largest, this.stats.history[0]));
            }
        }
        return maxItems;
        // could this be written in a more understandable way? sure. but I can't be bothered right now. -- @codefrau
    }
}
Lobby.register("Lobby");

class LobbyView extends Croquet.View {
    constructor(model) {
        super(model);
        this.maxUsers = MAX_USERS;
        this.model = model;
        this.subscribe(this.sessionId, "relay-changed", this.relayChanged);
        this.subscribe(this.sessionId, "session-changed", this.showSessions);
        this.interval = setInterval(() => this.showSessions(), 1000);
        this.showSessions();

        // Bind the "Host New Game" button
        const newGameButton = document.getElementById('host-new');
        newGameButton.addEventListener("click", () => {
            const dialog = document.getElementById('host-dialog');
            const nameInput = document.getElementById('host-dialog-name');
            const okButton = document.getElementById('host-dialog-submit');
            const cancelButtons = document.querySelectorAll('.host-dialog-cancel');
            okButton.onclick = e => {
                e.preventDefault();
                const name = nameInput.value.trim();
                if (name) dialog.close(name);
            };

            for (const cancelButton of cancelButtons) {
                cancelButton.onclick = e => {
                    // in Chrome, pressing return in the name field triggers a click on the first cancel button?!
                    if (!e.clientX) okButton.onclick(e);
                    else dialog.close("");
                };
            }

            dialog.onclose = e => {
                const name = dialog.returnValue;
                if (name) {
                    document.activeElement.blur(); // hide the keyboard
                    this.sessionClicked(name);
                }
            };

            dialog.showModal();
            nameInput.focus();
        });

        window.onmessage = e => {
            if (e.data && e.data.type === "croquet-lobby") {
                const { name, users } = e.data;
                // console.log("lobby", "in app session", name, users);
                this.publish(this.sessionId, "in-app-session", { viewId: this.viewId, name, now: Date.now(), users });
                if (name !== appSessionName) {
                    console.error("lobby", "app session is different", name, this.viewId);
                }
            }
        };
    }

    async relayChanged({ name, viewId }) {
        console.log("lobby", "relay changed", name, viewId, viewId === this.viewId ? "(me)" : "(not me)");
        if (this.session === lobbySession && name === appSessionName && viewId !== this.viewId) {
            console.log("lobby", "leaving lobby session", name, this.viewId);
            await this.session.leave();
            lobbySession = null;
        }
    }

    showSessions() {
        if (appSessionName) return;

        // uncomment for testing
        // const sessions = [
        //     { name: "Demo", users: { count: 2, description: "2 users in here from all over the world [health: 42]", color: "blue" }, since: 100 },
        //     { name: "Game 1", users: { count: 5, description: "5 users in here [health: 12]", color: "red" }, since: 200 },
        //     { name: "Game 2", users: { count: 3, description: "3 users in here [health: 42]", color: "yellow" }, since: 300 },
        //     { name: "Game 3", users: { count: 1, description: "1 user in here [health: 77]", color: "green" }, since: 400 },
        //     { name: "Game 4", users: { count: 4, description: "4 users in here [not started yet]", color: "black" }, since: 500 },
        // ];

        // list ongoing sessions
        const sessions = Array.from(this.model.sessions.values());
        sessions.sort((a, b) => b.since - a.since);
        const list = document.getElementById("sessions");
        const items = [...list.querySelectorAll("li")];
        for (const session of sessions) {
            // reuse existing list item, or create a new one
            const index = items.findIndex(i => i.getAttribute("data-session") === session.name);
            let item = index >= 0 ? items.splice(index, 1)[0] : null;
            if (!item) {
                item = document.createElement("li");
                item.setAttribute("data-session", session.name);
                item.addEventListener("click", () => this.sessionClicked(session.name));
                list.appendChild(item);
            }
            // update the list item
            const users = session.users; // string or { count, description, color }
            const description = users.description || users;
            item.textContent = `${session.name}: ${description || "starting ..."}`;
            item.className = users.color;
        }
        // remove any remaining items
        for (const item of items) {
            list.removeChild(item);
        }
        document.getElementById("no-games").classList.toggle("hidden", sessions.length > 0);
        // list players in lobby
        const locations = new Map();
        let count = 0;
        let unknown = false;
        for (const view of this.model.views.values()) {
            const viewId = view.viewId;
            if (viewId === this.viewId) continue; // don't count self
            if (view.session) continue; // don't count in-app users
            count++;
            const loc = window.CROQUETVM.views[viewId]?.loc;  // FIXME: CROQUETVM is for debugging only
            if (loc?.country) {
                let location = loc.country;
                if (loc.region) location = loc.region + ", " + location;
                if (loc.city) location = loc.city.name + " (" + location + ")";
                locations.set(location, (locations.get(location) || 0) + 1);
            } else {
                unknown = true;
            }
        }
        let users = "Players in Lobby: You";
        if (count) {
            users += ` and ${count} user${count === 1 ? "" : "s"}`;
            if (locations.size > 0) {
                let sorted = [...locations].sort((a, b) => b[1] - a[1]);
                if (sorted.length > 3) {
                    sorted = sorted.slice(0, 3);
                    unknown = true;
                }
                users += ` from ${sorted.map(([location]) => location).join(", ")}`;
                if (unknown) users += " and elsewhere";
            }
        }
        document.getElementById("users").innerHTML = users;
        // stats
        const maxStats = [...this.model.maxStats()].map(([k,v]) => `${k}: ${v[k]} (${new Date(v.date).toISOString().slice(0,10)})`).join("\n");
        const totalNumSessions = this.model.stats.history.reduce((sum, v) => sum + v.numSessions, this.model.stats.prehistoricSessions);
        document.getElementById("intro").setAttribute("title", `${maxStats}\ntotalNumSessions: ${totalNumSessions}`);
    }

    sessionClicked(name) {
        const session = this.model.sessions.get(name);
        console.log("------- session: ", session);
        if ((session && this.maxUsers > session.users.count) || !session) {
            new Audio(engineStart).play();
            enterApp(name);
            clearInterval(this.interval);
            // possibly leave lobby session
            if (session) {
                const relay = session.relay;
                if (relay.viewId !== this.viewId) {
                    this.relayChanged({ name, viewId: relay.viewId });
                }
            }
        } else  new Audio(buttonFail).play();
    }

    detach() {
        clearInterval(this.interval);
        window.onmessage = joinLobbyOnMessage; // in case we become the relay
        super.detach();
    }
}

//////////////////////////////

function setAppSrc(src) {
    // to avoid getting two history entries, we can't just set iframe.src
    // but we have to replace the iframe itself
    const iframe = document.getElementById("app");
    const parent = iframe.parentNode;
    const newIframe = iframe.cloneNode();
    newIframe.src = src;
    parent.replaceChild(newIframe, iframe);
    iframe.src = ""; // just in case
}

function enterApp(name) {
    // open app in iframe
    appSessionName = name;
    const params = window.location.search.slice(1);
    setAppSrc(Croquet.Constants.AppUrl + `?session=${encodeURIComponent(name)}` + (params ? "&" + params : ""));
    // hide lobby, show app
    document.body.classList.toggle("in-lobby", false);
    // update session URL and QR code and title
    // window.location.hash = "#" + encodeURIComponent(name);
    window.history.pushState({ entered: "app" }, name, "#" + encodeURIComponent(name));
    Croquet.App.sessionURL = window.location.href;
    document.title = `${appname} - ${name}`;
    return name;
}

function exitApp() {
    appSessionName = "";
    // close app in iframe
    setAppSrc("");
    // hide app, show lobby
    document.body.classList.toggle("in-lobby", true);
    // update session URL and QR code and title
    window.history.pushState({ entered: "lobby" }, "Lobby", window.location.href.split("#")[0]);
    Croquet.App.sessionURL = window.location.href;
    document.title = `${appname} Lobby`;
}

function joinLobbyOnMessage(e) {
    if (e.data && e.data.type === "croquet-lobby") {
        joinLobby();
    }
}

function toggleLobbyOnHashChange() {
    appSessionName = window.location.hash.slice(1);
    try { appSessionName = decodeURIComponent(appSessionName) } catch (e) { /* ignore */ }
    if (appSessionName) {
        enterApp(appSessionName);
    } else {
        exitApp();
        joinLobby();
    }
}

let lobbySession = null;

async function joinLobby() {
    if (lobbySession) {
        console.warn("lobby", "already in lobby session");
        return;
    }
    lobbySession = Croquet.Session.join({
        ...apiKey,
        appId: "io.croquet.guardians.lobby",
        name: "lobby",
        password: "lobby",
        options: { BaseUrl }, // to get a different persistentId per deployment
        location: true,
        model: Lobby,
        view: LobbyView,
        autoSleep: false, // fixme – only need to force while game is running and we're the relay?
        tps: 1,
    });
    await lobbySession;
}

Croquet.App.makeWidgetDock(); // shows QR code

window.onhashchange = toggleLobbyOnHashChange; // e.g. back button
document.getElementById("back-to-lobby").onclick = () => {
    exitApp();
    joinLobby();
};

if (appSessionName) {
    // pretend we were in the lobby for backbutton purposes (not working?!)
    window.history.replaceState({ entered: "lobby" }, "Lobby", window.location.href.split("#")[0]);
    enterApp(appSessionName);
    window.onmessage = joinLobbyOnMessage; // in case we become the relay
} else {
    exitApp();
    joinLobby();
}
