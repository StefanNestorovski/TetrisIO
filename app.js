let path = require('path');
let express = require('express');
var app = express();
var server = require('http').Server(app);
var io = require('socket.io')(server);

let port = process.env.PORT || 8000;

server.listen(port);
// WARNING: app.listen(80) will NOT work here!

app.use('/', express.static(path.join(__dirname + '/public')));

let userSearchingForGame = null;
const users = {};
const socketsUserId = {};
let authIds = 0;

io.on('connection', (socket) => {
    console.log("New connection");

    socket.emit('authStart', authIds++);

    socket.on('authEnd', (id) => {
        users[id] = socket;
        socketsUserId[socket.id] = id;
    });


    socket.on('lookingForGame', (id) => {
        if (userSearchingForGame) {
            console.log("Game started between " + id + " and " + userSearchingForGame);
            socket.emit('startMatch', userSearchingForGame);
            users[userSearchingForGame].emit('startMatch', id);
            userSearchingForGame = null;
        } else {
            userSearchingForGame = id;
        }
    });

    socket.on('notLookingForGame', (id) => {
        if (userSearchingForGame === id) {
            console.log('not searching for game anymore')
            userSearchingForGame = null;
        }
    });

    socket.on('clientUpdate', (id, message) => {
        const parsed = JSON.parse(message);
        if (users[id]) {
            users[id].emit("serverGameUpdate", message)
        } else {
            socket.emit('otherPlayerDisconnected');
        }
    });

    socket.on('disconnect', () => {
        console.log("User " + socketsUserId[socket.id] + " disconnected")
        users[socketsUserId[socket.id]] = null;
    })
});

