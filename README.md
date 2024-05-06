---
{}
---
![](assets/lobby-logo.png)

# Croquet Guardians

### [🚀 PLAY IT! 🚀](https://croquet.io/guardians/ "🚀 PLAY IT! 🚀 ")

_Guardians_ is an open-source cooperative multiplayer game  
written by [David A Smith](https://en.wikipedia.org/wiki/David_A._Smith_(computer_scientist) "David A Smith")  
using the [Croquet Worldcore](https://github.com/croquet/worldcore "Croquet Worldcore") game engine.

It features massive numbers of AI bots, taking advantage of  
Croquet’s [Synchronized Computation Architecture](https://croquet.io/docs/croquet/ "Synchronized Computation Architecture") that uses only  
client-side code, and where additional bots do not incur additional  
network traffic or server load. From a Croquet programmer‘s point of view, there is no server.  
All the multiplayer code is contained in this repository and Worldcore's, yet you won't find networking or server code in either.

This is the Web version of _Guardians_, there is also a [Unity port](https://github.com/croquet/croquet-for-unity-guardians "Unity port").

## Hack it

1.  install dependencies
    
    ```
     npm i
    ```
    
2.  edit [apiKey.js](apiKey.js "apiKey.js") with your API key from [croquet.io/keys](https://croquet.io/keys/ "croquet.io/keys").
3.  run it
    
    ```
     npm start
    ```
    

## The Game

![](assets/readme.jpg)

The game is implemented using Worldcore.

- [game.js](game.js "game.js"): imports actors, pawns, and api key, starts session
- [src/Actors.js](src/Actors.js "src/Actors.js"): the shared simulation – bots, tanks, etc.
- [src/Pawns.js](src/Pawns.js "src/Pawns.js"): 3D models and UI
- [src/Pawns-Avatar.js](src/Pawns-Avatar.js "src/Pawns-Avatar.js"): tank controls
- [src/Pawns-HUD.js](src/Pawns-HUD.js "src/Pawns-HUD.js"): HUD widgets

## The Lobby

The Lobby is implemented using plain Croquet (not Worldcore).

- [lobby.js](lobby.js "lobby.js")

The lobby is a separate Croquet session. It shows a list of ongoing games.  
When entering a game, it is loaded in an iframe inside the lobby.

The game will periodically send `"croquet-lobby"` window messages to its parent iframe, which the `LobbyView` will use to publish `"in-app-session"` events to its shared `Lobby` model. That game-session will be added to the `Lobby`'s `sessions` Map by its name so other lobby users can see and join it. After a timeout the session will be removed from the map, unless another `"in-app-session"` event was received.

For a given game session, only one of its user will be "elected" to relay messages to the lobby (see `LobbyRelayActor` in [src/Actors.js](src/Actors.js "src/Actors.js") and `LobbyRelayPawn` in [src/Pawns.js](src/Pawns.js "src/Pawns.js")). All other users will leave the lobby session, and if one of them is elected, only that user will rejoin the lobby session. This ensures scaling for the lobby.

## Questions

Please ask questions on our [discord](https://croquet.io/discord "discord").