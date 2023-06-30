import * as Croquet from "@croquet/worldcore-kernel";
import apiKey from "./apiKey";

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

class Lobby extends Croquet.Model {

    init() {
        this.sessions = new Map();
        this.views = new Map();
        this.subscribe(this.sessionId, "view-join", this.viewJoined);
        this.subscribe(this.sessionId, "view-exit", this.viewExited);
        this.subscribe(this.sessionId, "in-app-session", this.inAppSession);
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
        }
        return session;
    }

    viewJoined(viewId) {
        this.views.set(viewId, {
            viewId,
            session: null,
        });
        console.log("lobby", this.now(), "view joined", viewId, [...this.views.keys()]);
    }

    viewExited(viewId) {
        const view = this.views.get(viewId);
        this.views.delete(viewId);
        const session = view.session;
        if (session) {
            session.views.delete(view);
            const count = "count" in session.users ? session.users.count : parseInt(session.users, 10);
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
}
Lobby.register("Lobby");

class LobbyView extends Croquet.View {
    constructor(model) {
        super(model);
        this.model = model;
        this.subscribe(this.sessionId, "relay-changed", this.relayChanged);
        this.subscribe(this.sessionId, "session-changed", this.showSessions);
        this.interval = setInterval(() => this.showSessions(), 1000);
        this.showSessions();

        // Bind the "Host New Game" button
        const newGameButton = document.getElementById('host-new');
        newGameButton.addEventListener("click", () => this.sessionClicked(null));

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
    }

    sessionClicked(name) {
        name = enterApp(name);
        if (!name) return;
        clearInterval(this.interval);
        // possibly leave lobby session
        const session = this.model.sessions.get(name);
        if (session) {
            const relay = session.relay;
            if (relay.viewId !== this.viewId) {
                this.relayChanged({ name, viewId: relay.viewId });
            }
        }
    }

    detach() {
        clearInterval(this.interval);
        window.onmessage = joinLobbyOnMessage; // in case we become the relay
        super.detach();
    }
}

//////////////////////////////

function enterApp(name) {
    // fixme: use a better UI
    if (!name) {
        name = prompt("Session Name");  // eslint-disable-line no-alert
        if (!name) return "";
    }
    // open app in iframe
    appSessionName = name;
    const iframe = document.getElementById("app");
    iframe.src = Croquet.Constants.AppUrl + `?session=${encodeURIComponent(name)}`;
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
    const iframe = document.getElementById("app");
    iframe.src = "";
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
    if (appSessionName) {
        enterApp(decodeURIComponent(appSessionName));
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
