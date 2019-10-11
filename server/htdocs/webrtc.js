var ws_server;
var peer_id = 666;
var configs = {iceServers: [
    {urls: "stun:stun.l.google.com:19302"},
    {urls: "stun:stun.services.mozilla.com"}
]};
var constraints = {video: true, audio: true};

var connect_attempts = 0;
var ws;
var pc;
var local;

function generateID() {
    return Math.floor(Math.random() * (9000 - 10) + 10).toString();
}

function setStatus(text) {
    console.log(text);
    var span = document.getElementById('status')

    if (!span.classList.contains('text-danger')) {
        span.textContent = text;
    }
}

function setError(text) {
    console.error(text);
    var span = document.getElementById('status');
    span.textContent = text;
    span.classList.add('text-danger');
}

function connect() {
    connect_attempts++;
    if (connect_attempts > 3) {
        setError("Too many connection attempts, aborting. Refresh page to try again");
        return;

    }

    var span = document.getElementById('status');
    span.classList.remove('text-danger');
    span.textContent = '';

    peer_id = peer_id || generateID();
    ws_server = ws_server || 'ws://127.0.0.1:8000';
    setStatus('Connecting to server ' + ws_server);

    ws = new WebSocket(ws_server);
    ws.onopen = function(event) {
        document.getElementById('peer-id').textContent = peer_id;
        ws.send('REGISTER ' + peer_id);
        setStatus('Registering with server');
    };
    ws.onmessage = function(event) {
        console.log('Received ' + event.data);
        switch (event.data) {
            case 'REGISTERED':
                setStatus('Registered with server, waiting for call');
                setLocalStream();
                return;
            default:
                if (event.data.startsWith('ERROR')) {
                    setError('ERROR: ' + event.data);
                    resetState();
                    return;
                }

                try {
                    msg = JSON.parse(event.data);
                } catch (e) {
                    setError('ERROR: Parsing incoming JSON: ' + event.data);
                    resetState();
                    return;
                }

                if (!pc) {
                    createPeer(msg);
                }

                if (msg.sdp != null) {
                    setSDP(msg.sdp);
                } else if (msg.ice != null) {
                    setCandidate(msg.ice);
                } else {
                    setError('ERROR: Unknown incoming JSON: ' + msg);
                    resetState();
                }
        }
    };
    ws.onclose = function(event) {
        setStatus('Disconnected from server');
        resetVideo();

        if (pc) {
            pc.close();
            pc = null;
        }

        window.setTimeout(connect, 2500);
    };
    ws.onerror = function(event) {
        setError('Unable to connect to server');
        window.setTimeout(websocketServerConnect, 3000);
    };
}

function setLocalStream() {
    if (navigator.mediaDevices.getUserMedia) {
        navigator.mediaDevices.getUserMedia(constraints)
        .then(function(stream) {
            local = stream;
            document.getElementById('local').srcObject = local;
        }).catch(setError);
    } else {
        setError('ERROR: Browser does not support getUserMedia');
    }
}

function createPeer(msg) {
    console.log('Creating peer connection');
    connect_attempts = 0;
    pc = new RTCPeerConnection(configs);
    pc.addStream(local);
    pc.ontrack = function(event) {
        if (document.getElementById('remote').srcObject !== event.streams[0]) {
            console.log('Incoming stream');
            document.getElementById('remote').srcObject = event.streams[0];
        }
    };
    pc.onicecandidate = function(event) {
        if (event.candidate == null) {
            console.log('ICE Candidate was null, done');
            return;
        }

        ws.send(JSON.stringify({'ice': event.candidate}));
    };

    if (!msg.sdp) {
        console.log('WARNING: First message was not an SDP message');
    }

    setStatus('Created peer connection for call, waiting for SDP');
}

function setSDP(sdp) {
    pc.setRemoteDescription(sdp)
    .then(function() {
        setStatus('Remote SDP set');

        if (sdp.type != 'offer') {
            return;
        }

        setStatus('Got SDP offer');
        console.log(local);

        if (local) {
            pc.createAnswer()
            .then(function(event) {
                console.log('Got local description: ' + JSON.stringify(event));
                pc.setLocalDescription(event)
                .then(function() {
                    setStatus('Sending SDP answer');
                    ws.send(JSON.stringify({'sdp': pc.localDescription}));
                }).catch(setError);
            }).catch(setError);
        }
    }).catch(setError);
}

function setCandidate(ice) {
    var candidate = new RTCIceCandidate(ice);
    pc.addIceCandidate(candidate).catch(setError);
}

function resetVideo() {
    if (local) {
        local.getTracks().forEach(function (track) {
            track.stop();
        });
    }

    document.getElementById('local').pause();
    document.getElementById('local').src = '';
    document.getElementById('local').load();
    document.getElementById('remote').pause();
    document.getElementById('remote').src = '';
    document.getElementById('remote').load();
}
