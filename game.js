// GUARDIANS

// This is the first game created for Croquet for Unity.

import { App, StartWorldcore} from "@croquet/worldcore-kernel";

import { MyModelRoot } from "./src/Actors";
import {  MyViewRoot } from "./src/Pawns";
import apiKey from "./apiKey";

// redirect to lobby if not in iframe or session
const inIframe = window.parent !== window;
const url = new URL(window.location.href);
const sessionName = url.searchParams.get("session");
url.pathname = url.pathname.replace(/[^/]*$/, "index.html");
App.sessionURL = url.href;
if (!inIframe || !sessionName) window.location.href = App.sessionURL;

App.makeWidgetDock();
StartWorldcore({
    ...apiKey,
    appId: 'io.croquet.guardians', // <-- feel free to change
    name: sessionName,
    password: "none",
    location: true,
    model: MyModelRoot,
    view: MyViewRoot,
});
