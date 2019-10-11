process.title = 'signaling-server';

var fs = require('fs');
var http = require('http');
var path = require('path');
var websocket = require('websocket').server;

var port = 8000;
var peers = [];
var clients = [];
var sessions = [];

var httpServer = http.createServer(serveHttp).listen(port, function() {
    console.log('Server listening on port: ' + port);
});
var wsServer = new websocket({
    httpServer: httpServer
});

wsServer.on('request', function(request) {
    console.log((new Date()) + ' Connection from origin ' + request.origin + '.');
    var ws = request.accept(null, request.origin);
    var index = clients.push(ws) - 1;
    var username = null;

    ws.on('message', function(message) {
        if (message.type === 'utf8') {
            var msg = message.utf8Data;
            var cmd = msg.split(' ');

            if (username === null) {
                if (cmd[0] === 'REGISTER' && cmd[1] !== null) {
                    username = registerUser(ws, cmd[1]);
                }
            } else {
                if (cmd[0] === 'CALL' && cmd[1] !== null) {
                    callUser(ws, username, cmd[1]);
                } else if (peers[username][1] == 'SESSION') {
                    var target = sessions[username];
                    peers[target][0].sendUTF(msg);
                    console.log('User ' + username + ' send message to user ' + target + '.');
                }
            }
        }
    });

    ws.on('close', function(connection) {
        if (username !== null) {
            console.log((new Date()) + ' User ' + username + ' disconnected.');
            clients.splice(index, 1);
            removeUser(ws, username);
        }
    });
});

function serveHttp(request, response) {
    var filepath = '';

    if (request.url === '' || request.url === '/') {
        filepath = './htdocs/index.html';
    } else {
        var filepath = './htdocs' + request.url;
    }

    var contenttype = 'text/html';
    var extname = path.extname(filepath);
    switch (extname) {
        case '.js':
            contenttype = 'text/javascript';
            break;
        case '.css':
            contenttype = 'text/css';
            break;
        case '.png':
            contenttype = 'image/png';
            break;
        case '.jpg':
            contenttype = 'image/jpg';
            break;
    }

    fs.readFile(filepath, function(error, content) {
        if (error) {
            if (error.code == 'ENOENT'){
                fs.readFile('./404.html', function(error, content) {
                    response.writeHead(200, { 'Content-Type': contenttype });
                    response.end(content, 'utf-8');
                });
            } else {
                fs.readFile('./500.html', function(error, content) {
                    response.writeHead(500, { 'Content-Type': contenttype });
                    response.end(content, 'utf-8');
                });
            }
        } else {
            response.writeHead(200, { 'Content-Type': contenttype });
            response.end(content, 'utf-8');
        }
    });
}

function registerUser(ws, user) {
    var res = null;

    if (typeof peers[user] !== 'undefined') {
        ws.close(1003, 'User id already registered.');
        console.error('User id ' + user + ' already registered.');
    } else {
        peers[user] = [ws, null];
        ws.sendUTF('REGISTERED');
        console.log('User id ' + user + ' successfully registered.');
        res = user;
    }

    return user;
}

function callUser(ws, user, peer) {
    if (typeof peers[user] === 'undefined') {
        ws.sendUTF('ERROR: Peer ' + peer + ' not found.');
        console.error('ERROR: Peer ' + peer + ' not found.');
        return;
    } else if (peers[user][1] !== null) {
        ws.sendUTF('ERROR: Peer ' + peer + ' is busy.');
        console.error('ERROR: Peer ' + peer + ' is busy.');
        return;
    }

    ws.sendUTF('CALL_OK');
    peers[user][1] = 'SESSION';
    sessions[user] = peer;
    peers[peer][1] = 'SESSION';
    sessions[peer] = user;
    return;
}

function removeUser(ws, user) {
    if (typeof peers[user] !== 'undefined') {
        if (typeof sessions[user] !== 'undefined') {
            var peer = sessions[user];
            console.log(peers[peer])
            delete sessions[user];

            if (typeof peers[peer] !== 'undefined') {
                if (typeof sessions[peer] !== 'undefined') {
                    delete sessions[peer];
                }

                peers[peer][0].close();
                delete peers[peer];
            }
        }
        delete peers[user];
        ws.close();
    }

    return;
}
