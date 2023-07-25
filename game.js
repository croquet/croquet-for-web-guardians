// GUARDIANS

// This is the first game created for Croquet for Unity.

import { App, Constants, StartWorldcore} from "@croquet/worldcore-kernel";

import { MyModelRoot } from "./src/Actors";
import {  MyViewRoot } from "./src/Pawns";
import apiKey from "./apiKey";

// redirect to lobby if not in iframe or session
const inIframe = window.parent !== window;
const url = new URL(window.location.href);
const sessionName = url.searchParams.get("session");
url.pathname = url.pathname.replace(/[^/]*$/, "index.html");
if (!inIframe || !sessionName) window.location.href = url.href;

// ensure unique session per lobby URL
const BaseUrl = url.href.replace(/[^/?#]*([?#].*)?$/, "");
Constants.LobbyUrl = BaseUrl + "index.html";    // hashed into sessionId without params

// QR code points to lobby, with session name in hash
url.searchParams.delete("session");
url.hash = encodeURIComponent(sessionName);
App.sessionURL = url.href;

App.makeWidgetDock({ iframe: true });
StartWorldcore({
    ...apiKey,
    appId: 'io.croquet.guardians', // <-- feel free to change
    name: sessionName,
    password: "none",
    location: true,
    model: MyModelRoot,
    view: MyViewRoot,
});
