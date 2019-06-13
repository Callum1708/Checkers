var express = require ('express');
var app = express();
var serv = require ('http').Server(app);
var io = require('socket.io')(serv);
var fs = require('fs');


app.get("/", function(req, res) {

    res.sendFile(__dirname + '/client/index.html');

})

app.use('/client', express.static(__dirname + '/client'));

serv.listen(2000);
console.log("Server has started...");

var connectedClients = [];

var clients = [];
var rooms = [];

var gridSize = 8; // Initial value for the size of the grid.
var startAsKings = false;

io.sockets.on('connection', function(socket) {

    var client = {
        name: null,
        IPAddress: null,
        inRoom: null,
    };

    connectedClients.push(socket.id);
    console.log(connectedClients);
    client.IPAddress = socket.request.connection.remoteAddress.split(":").pop();

    socket.on('nameSubmitted', function(data) {
        for (i = 0; i < clients.length; i++) {
            if (clients[i].name == data.name) {
                socket.emit('nameTaken');
                return;
            }
        }
        client.name = data.name;
        printWithTimeStamp(data.name + " connected from " + client.IPAddress);
        clients.push(client);
    })

    socket.on('setForceJump', function(data) {

        var clientIndex = connectedClients.indexOf(socket.id);
        var clientRoom = clients[clientIndex].inRoom;

        if (clientRoom == null) {
            socket.emit('notify', { // Tell the client the room is full.
                msg: "You must be in a room to change this setting!",
                alert: true
            });
        }

        for (i = 0; i < rooms.length; i++) {
            if (rooms[i].code == clientRoom) {
                if (rooms[i].gameStarted) {
                    socket.emit('notify', { // Tell the client the room is full.
                        msg: "The game has already started!",
                        alert: true
                    });
                    socket.emit('setForceJumpSwitch', {
                        state: rooms[i].forceJump
                    });
                    return
                }
                rooms[i].forceJump = !rooms[i].forceJump;
                console.log(rooms[i].forceJump);

                io.sockets.in(clientRoom).emit('setForceJumpSwitch', {
                    state: rooms[i].forceJump
                });
            }
        }
    })

    socket.on('createRoom', function() { // This will be exeucted when a client attempts so host a game (e.g. create a new room).

        var clientIndex = connectedClients.indexOf(socket.id); // The index of the client in the connectedClients array.

        if (clients[clientIndex].inRoom != null) {
            socket.emit('notify', { // Tell the client the room is full.
                msg: "You are already in a room! Please leave your current room inorder to create a room.",
                alert: true
            });
            return
        }

        var allowedChars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"; // The set of characters that will be used to create the random 4 char code for the room.
        var generatedCode = ""; // Initializing a string var for the generated code.

        for (i = 0; i < 4; i++) { // Simple for loop which will be executed 4 times.
            var ranNum = Math.floor(Math.random() * allowedChars.length); // Select a random char from the code set.
            generatedCode += allowedChars.charAt(ranNum); // Add the selected code to the end of the genrerated code string.
        }

        var linesOfPiecesPerPlayer = 3; // Initial value for the ammount of lines of peices each player gets.

        grid = []; // Initialize grid array for the room.
        pieces = [];

        for (i = 0; i < gridSize; i++) { // Create and populate the grid.
            grid[i] = [];
            for (j = 0; j < gridSize; j++) {

                grid[i][j] = {
                    VPos: i,
                    HPos: j,
                    Type : null
                };

                if (i % 2 == 0) {
                    if (j % 2 == 0) {
                        //fix later
                    } else {
                        if (i < linesOfPiecesPerPlayer) {
                            grid[i][j].Type = "player2";
                            pieces.push({
                                VPos: i,
                                HPos: j,
                                Type: "player2",
                                isKing: startAsKings
                            })
                        } else if (i >= gridSize - linesOfPiecesPerPlayer) {
                            grid[i][j].Type = "player1";
                            pieces.push({
                                VPos: i,
                                HPos: j,
                                Type: "player1",
                                isKing: startAsKings
                            })
                        }
                    }
                } else {
                    if (j % 2 != 0) {
                        //fix later
                    } else {
                        if (i < linesOfPiecesPerPlayer) {
                            grid[i][j].Type = "player2";
                            pieces.push({
                                VPos: i,
                                HPos: j,
                                Type: "player2",
                                isKing: startAsKings
                            })
                        } else if (i >= gridSize - linesOfPiecesPerPlayer) {
                            grid[i][j].Type = "player1";
                            pieces.push({
                                VPos: i,
                                HPos: j,
                                Type: "player1",
                                isKing: startAsKings
                            })
                        }
                    }
                }
            }
        }

        var room = {
            code: generatedCode,
            player1: client.name,
            player2: null,
            grid: grid,
            pieces: pieces,
            turn: client.name,
            gameStarted: false,
            forceJump: false,
            player1PiecesLeft: 12,
            player2PiecesLeft: 12

        }

        printWithTimeStamp("Client '" + client.name + "' created room '" + generatedCode + "'.");

        rooms.push(room); // Push the newly created room into the rooms array.
        clients[clientIndex].inRoom = generatedCode; // Update the inRoom var for the client.
        socket.join(generatedCode); // Join the socket of the client to the room.

        socket.emit('setRoom', { // Set the room on the client side.
            room: generatedCode,
            opponentName: null,
            isHost: true
        });

        socket.emit('updateGrid', { // Send the game grid over to the client for rendering.
            pieces: pieces,
            player: client.name,
            firstLoad: true
        });
    })

    socket.on('joinRoom', function(room) { // This will be executed when a client attempts to join a room.

        var roomFound = false; // Initial val for if the room exists.
        var roomIndex;
        var opponentName = ""; // Initial val for the other player in the room.

        for (k = 0; k < rooms.length; k++) { // For every room
            if (rooms[k].code == room) { // If the rooms code is equal to the code entered.
                roomFound = true; // Update roomFound val.
                roomIndex = k;
                if (rooms[k].player1 == null || rooms[k].player2 == null) { // If there is an empty space in the room.
                    if (rooms[k].player1 == null) { // If the first space is empty.
                        rooms[k].player1 = client.name; // Take the space for the current client.
                        opponentName = rooms[k].player2; // Set opponent name to the other player in the room (CAN BE EMPTY).
                    } else if (rooms[k].player2 == null) { // else if the second space is empty.
                        rooms[k].player2 = client.name; // Take the space for the current client.
                        opponentName = rooms[k].player1; // Set opponent name to the other player in the room (CAN BE EMPTY).
                    }
                    joinRoom(); // Join the client to the room.
                } else { // Else if there are no empty spaces in the room.
                    socket.emit('notify', { // Tell the client the room is full.
                        msg: "This room is full!",
                        alert: true
                    });
                }
            }
        }

        if (!roomFound) { // If no room was found with that code...
            socket.emit('notify', { // Tell the client thata room with that code does not exist.
                msg: "This room does not exist!",
                alert: true
            })
        }

        function joinRoom() {
            socket.join(room); // join the clients socket with the room.
            client.inRoom = room;

            socket.broadcast.to(room).emit('notify', {
                msg: client.name + " has joined the room!",
                alert: false
            });

            socket.broadcast.to(room).emit('setOpponateName', {opponentName: client.name});

            socket.emit('setRoom', {
                room: room,
                opponentName: opponentName,
                isHost: false
            });

            socket.emit('updateGrid', {
                pieces: pieces,
                player: "player2",
                firstLoad: true
            });

            io.sockets.in(room).emit('setForceJumpSwitch', {
                state: rooms[roomIndex].forceJump
            });
        }
    });

    socket.on('leaveRoom', function(room) {

        var i = connectedClients.indexOf(socket.id);
        var name = clients[i].name;

        for (k = 0; k < rooms.length; k++) {
            if (rooms[k].code == room) { // If a room called param.room exists...

                if ((rooms[k].player1 == name && rooms[k].player2 == null) || (rooms[k].player1 == null && rooms[k].player2 == name)) {
                    printWithTimeStamp("Room '" + rooms[k].code + "' will be deleted due to have no connected players");
                    rooms.splice(k, 1);

                } else if (rooms[k].player1 == name) {
                    rooms[k].player1 = null
                } else if (rooms[k].player2 == name) {
                    rooms[k].player2 = null
                }

                socket.emit('setRoom', {room: "Lobby"}); // Update the client.
                clients[i].inRoom = null;
                return;
            }
        }
    })

    socket.on('validateMove', function(data) {

        var clientIndex = connectedClients.indexOf(socket.id);
        var name = clients[clientIndex].name;
        var room = clients[clientIndex].inRoom;
        var roomGrid;
        var roomIndex;
        var isRoomHost;
        var playerType;
        var opponentType;
        var forceJump;
        var isKing;

        for (i = 0; i < rooms.length; i++) {
            if (rooms[i].code == room) {
                roomIndex = i;
                forceJump = rooms[i].forceJump;
                break;
            }
        }

        if (rooms[roomIndex].player1 == name) {
            isRoomHost = true;
        } else {
            isRoomHost = false;
        }

        for (i = 0; i < rooms[roomIndex].pieces.length; i++) {
            if ((rooms[roomIndex].pieces[i].VPos == data.originVPos) && (rooms[roomIndex].pieces[i].HPos == data.originHPos)) {
                isKing = rooms[roomIndex].pieces[i].isKing;
                break;
            }
        }

        var vertDir; // The vertical Direction in which the current player is playing represented by an interger. E.g. +1 is top down and -1 is bottom up.

        if (isRoomHost) {
            playerType = "player1";
            opponentType = "player2";
            vertDir = -1; // set the correct values.
        } else {
            playerType = "player2";
            opponentType = "player1";
            vertDir = 1; // set the correct values.
        }

        roomGrid = rooms[roomIndex].grid;

        if (!(rooms[roomIndex].player1 == name) && !(rooms[roomIndex].player2 == name)) {
            socket.emit('notify', {
                msg: "ERROR: Player name does not exist in room",
                alert: true
            })
            return
        } else if (rooms[roomIndex].turn != name) {
            socket.emit('notify', {
                msg: "ERROR: It is not the current players turn. Stop trying to cheat :)",
                alert: true
            })
            return
        }

        var validMoves = [];
        var piecesToRemove = [];

        var leapExists = checkIfLeapExists(data.originVPos, data.originHPos, isKing);

        if (forceJump && leapExists) {
            populateValidMoves(data.originVPos, data.originHPos, data.originVPos, data.originHPos, data.leap, data.VRoute, data.HRoute, isKing);
        } else {
            populateValidMoves(data.originVPos, data.originHPos, data.originVPos, data.originHPos, !data.leap, data.VRoute, data.HRoute, isKing);
        }

        if (validMoves.length == 0) {
            console.log("NON VALID MOVE");
            return;
        } else {
            for (i = 0; i < validMoves.length; i++) {
                if ((validMoves[i].VPos == data.moveToVPos) && (validMoves[i].HPos == data.moveToHPos)) {
                    console.log("VALID MOVE");
                    rooms[roomIndex].grid[data.originVPos][data.originHPos].Type = null;
                    rooms[roomIndex].grid[data.moveToVPos][data.moveToHPos].Type = playerType;
                    for (j = 0; j < piecesToRemove.length; j++) {
                        for (k = 0; k < rooms[roomIndex].pieces.length; k++) {
                            if ((rooms[roomIndex].pieces[k].VPos == piecesToRemove[j].VPos) && (rooms[roomIndex].pieces[k].HPos == piecesToRemove[j].HPos)) {
                                rooms[roomIndex].pieces.splice(k, 1);
                                if (isRoomHost) {
                                    rooms[roomIndex].player2PiecesLeft = rooms[roomIndex].player2PiecesLeft - 1;
                                } else {
                                    rooms[roomIndex].player1PiecesLeft = rooms[roomIndex].player1PiecesLeft - 1;
                                }
                                rooms[roomIndex].grid[piecesToRemove[j].VPos][piecesToRemove[j].HPos].Type = null;
                            }
                        }
                    }
                    for (j = 0; j < rooms[roomIndex].pieces.length; j++) {
                        if ((rooms[roomIndex].pieces[j].VPos == data.originVPos) && (rooms[roomIndex].pieces[j].HPos == data.originHPos)) {
                            rooms[roomIndex].pieces.splice(j, 1);
                            break;
                        }
                    }

                    if (playerType == "player1" && data.moveToVPos == 0) {
                        isKing = true;
                    } else if (playerType == "player2" && data.moveToVPos == 7) {
                        isKing = true;
                    }

                    rooms[roomIndex].pieces.push({
                        VPos: data.moveToVPos,
                        HPos: data.moveToHPos,
                        Type: playerType,
                        isKing: isKing
                    })

                    var opponentName;

                    if (playerType == "player1") {
                        opponentName = rooms[roomIndex].player2;
                    } else {
                        opponentName = rooms[roomIndex].player1;
                    }
                    rooms[roomIndex].turn = opponentName;
                    rooms[roomIndex].gameStarted = true;
                    io.sockets.in(room).emit('updateGrid', {
                        pieces: rooms[roomIndex].pieces,
                        player: opponentName,
                        firstLoad: false
                    })
                    console.log("player 1 has " + rooms[roomIndex].player1PiecesLeft + " pieces left.");
                    console.log("player 2 has " + rooms[roomIndex].player2PiecesLeft + " pieces left.");

                    if (rooms[roomIndex].player1PiecesLeft == 0) {
                        io.sockets.in(room).emit('notify', {
                            msg: rooms[roomIndex].player2 + " has won the game!",
                            alert: true
                        })
                    } else if (rooms[roomIndex].player2PiecesLeft == 0) {
                        io.sockets.in(room).emit('notify', {
                            msg: rooms[roomIndex].player1 + " has won the game!",
                            alert: true
                        })
                    }
                    return;
                }
            }
            console.log("NON VALID MOVE");
        }

        function populateValidMoves(VPos, HPos, originVPos, originHPos, closeCheck, VRoute, HRoute, isKing) {
            var leapFound = false;

            if (VRoute.length == 0 && HRoute.length == 0) {
                if (!leapFound || !forceJump) {
                    //close left check
                    if (!(HPos - 1 < 0) && !(VPos + vertDir < 0) && !(VPos + vertDir > 7) && closeCheck) {
                        if (roomGrid[VPos + vertDir][HPos - 1].Type == null) {
                            validMoves.push({
                                VPos: VPos + vertDir,
                                HPos: HPos - 1
                            })
                        }
                    }
                    // close right check
                    if (!(HPos + 1 >= gridSize) && !(VPos + vertDir < 0) && !(VPos + vertDir > 7) && closeCheck) {
                        if (roomGrid[VPos + vertDir][HPos + 1].Type == null) {
                            validMoves.push({
                                VPos: VPos + vertDir,
                                HPos: HPos + 1
                            })
                        }
                    }

                    if (isKing) {
                        if (!(HPos - 1 < 0) && !(VPos + (vertDir / -1) < 0) && !(VPos + (vertDir / -1) > 7) && closeCheck) {
                            if (roomGrid[VPos + (vertDir / -1)][HPos - 1].Type == null) {
                                validMoves.push({
                                    VPos: VPos + (vertDir / -1),
                                    HPos: HPos - 1
                                })
                            }
                        }
                        // close right check
                        if (!(HPos + 1 >= gridSize) && !(VPos + (vertDir / -1) < 0) && !(VPos + (vertDir / -1) > 7) && closeCheck) {
                            if (roomGrid[VPos + (vertDir / -1)][HPos + 1].Type == null) {
                                validMoves.push({
                                    VPos: VPos + (vertDir / -1),
                                    HPos: HPos + 1
                                })
                            }
                        }
                    }
                }
            }

            if (VRoute[0] == "-1") { // If moving up
                if (HRoute[0] == "R") {
                    if (!(VPos + ((1 / -1) * 2) < 0) && !(HPos + 2 >= 8) && !(VPos + ((1 / -1) * 2) >= 8)) {

                        if (roomGrid[VPos + ((1 / -1) * 2)][HPos + 2].Type == null && roomGrid[VPos + (1 / -1)][HPos + 1].Type == opponentType) {

                            VRoute.splice(0, 1);
                            HRoute.splice(0, 1);

                            validMoves.push({
                                VPos: VPos + ((1 / -1) * 2),
                                HPos: HPos + 2
                            })
                            piecesToRemove.push({
                                VPos: VPos + (1 / -1),
                                HPos: HPos + 1
                            })
                            populateValidMoves(VPos + ((1 / -1) * 2), HPos + 2, originVPos, originHPos, closeCheck, VRoute, HRoute, isKing);
                        }
                    }
                } else if (HRoute[0] == "L") {
                    if (!(VPos + ((1 / -1) * 2) < 0) && !(HPos - 2 < 0) && !(VPos + ((1 / -1) * 2) >= 8)) {
                        if (roomGrid[VPos + ((1 / -1) * 2)][HPos - 2].Type == null && roomGrid[VPos + (1 / -1)][HPos - 1].Type == opponentType) {
                            VRoute.splice(0, 1);
                            HRoute.splice(0, 1);

                            validMoves.push({
                                VPos: VPos + ((1 / -1) * 2),
                                HPos: HPos - 2
                            })
                            piecesToRemove.push({
                                VPos: VPos + (1 / -1),
                                HPos: HPos - 1
                            })
                            populateValidMoves(VPos + ((1 / -1) * 2), HPos - 2, originVPos, originHPos, closeCheck, VRoute, HRoute, isKing);
                        }
                    }
                }
            } else if (VRoute[0] == "1") { // If moving down
                if (HRoute[0] == "R") {
                    if (!(VPos + (1 * 2) < 0) && !(HPos + 2 >= 8) && !(VPos + (1 * 2) >= 8)) {
                        if (roomGrid[VPos + (1 * 2)][HPos + 2].Type == null && roomGrid[VPos + 1][HPos + 1].Type == opponentType) {

                            VRoute.splice(0, 1);
                            HRoute.splice(0, 1);

                            validMoves.push({
                                VPos: VPos + (1 * 2),
                                HPos: HPos + 2
                            })
                            piecesToRemove.push({
                                VPos: VPos + 1,
                                HPos: HPos + 1
                            })
                            populateValidMoves(VPos + (1 * 2), HPos + 2, originVPos, originHPos, closeCheck, VRoute, HRoute, isKing);

                        }
                    }
                } else if (HRoute[0] == "L") {
                    if (!(VPos + (1 * 2) < 0) && !(HPos - 2 < 0) && !(VPos + (1 * 2) >= 8)) {
                        if (roomGrid[VPos + (1 * 2)][HPos - 2].Type == null && roomGrid[VPos + 1][HPos - 1].Type == opponentType) {
                            VRoute.splice(0, 1);
                            HRoute.splice(0, 1);

                            validMoves.push({
                                VPos: VPos + (1 * 2),
                                HPos: HPos - 2
                            })
                            piecesToRemove.push({
                                VPos: VPos + 1,
                                HPos: HPos - 1
                            })
                            populateValidMoves(VPos + (1 * 2), HPos - 2, originVPos, originHPos, closeCheck, VRoute, HRoute, isKing);
                        }
                    }
                }
            }
        }

        function checkIfLeapExists(VPos, HPos, isKing) {
            var pieces = rooms[roomIndex].pieces;
            for (i = 0; i < rooms[roomIndex].pieces.length; i++) {
                if (pieces[i].Type == playerType) {
                    if (!(pieces[i].HPos - 2 < 0) && !(pieces[i].VPos + (vertDir * 2) < 0) && !(pieces[i].VPos + (vertDir * 2) >= 8) && !(pieces[i].VPos + (vertDir * 2) < 0)) {
                        if (roomGrid[pieces[i].VPos + vertDir][pieces[i].HPos - 1].Type == opponentType && roomGrid[pieces[i].VPos + (vertDir * 2)][pieces[i].HPos - 2].Type == null) {
                            return true;
                        }
                    }
                    if (!(pieces[i].HPos + 2 >= gridSize) && !(pieces[i].VPos + (vertDir * 2) < 0) && !(pieces[i].VPos + (vertDir * 2) >= 8) && !(pieces[i].VPos + (vertDir * 2) < 0)) {
                        if (roomGrid[pieces[i].VPos + vertDir][pieces[i].HPos + 1].Type == opponentType && roomGrid[pieces[i].VPos + (vertDir * 2)][pieces[i].HPos + 2].Type == null) {
                            return true;
                        }
                    }
                }
            }

            return false;
        }
    })

    socket.on('chatMessage', function(msg) {
        var i = connectedClients.indexOf(socket.id);
        var room = clients[i].inRoom;
        io.sockets.in(room).emit('messageRecieved', {
            name: client.name,
            msg: msg
        })
    })

    socket.on('disconnect', function() {
        var clientIndex = connectedClients.indexOf(socket.id);
        var roomIndex;
        printWithTimeStamp(client.name + " disconnected.");
        if (clients[clientIndex].inRoom != null) {
            name = clients[clientIndex].name;
            for (i = 0; i < rooms.length; i++) {
                if (rooms[i].code == clients[clientIndex].inRoom) {
                    roomIndex = i;
                    break;
                }
            }
            if (rooms[roomIndex].player1 == name && rooms[roomIndex].player2 == null) {
                printWithTimeStamp("Room '" + rooms[roomIndex].code + "' will be deleted due to have no connected players");
                rooms.splice(roomIndex, 1);
            } else if (rooms[roomIndex].player1 == null && rooms[roomIndex].player2 == name) {
                printWithTimeStamp("Room '" + rooms[roomIndex].code + "' will be deleted due to have no connected players");
                rooms.splice(roomIndex, 1);
            } else if (rooms[roomIndex].player1 == name) {
                rooms[roomIndex].player1 = null
            } else if (rooms[roomIndex].player2 == name) {
                rooms[roomIndex].player2 = null
            }
        }
        connectedClients.splice(i, 1);
        clients.splice(i, 1);
    })
});

function printStatus() {
    if (connectedClients.length == 0) {
        printWithTimeStamp("There are currently no clients connected");
    } else {
        printWithTimeStamp("There are " + connectedClients.length + " clients connected");
        for (i = 0; i < clients.length; i++) {
            console.log(clients[i].name + ", " + clients[i].IPAddress + ", " + connectedClients[i] + " is connected.");
        }
    }
    if (rooms.length == 0) {
        console.log("There are currently no existing rooms.");
    } else {
        console.log("\nCurrent Rooms: ");
        for (i = 0; i < rooms.length; i++) {
            console.log("Room '" + rooms[i].code + "': " + rooms[i].player1 + " and " + rooms[i].player2)
        }
    }
}

function printWithTimeStamp(msg) {
    var time = new Date();
    console.log(time.getHours() + ":" + time.getMinutes() + ":" + time.getSeconds() + " - \n" + msg);
}

printStatus();
setInterval(printStatus, 10000) // runs printStatus() once every 10 seconds.
