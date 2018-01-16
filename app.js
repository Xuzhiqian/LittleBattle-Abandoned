global.window = global.document = global;

var app = require("express")();
var server = require("http").Server(app);
var io = require("socket.io").listen(server);

app.get('/', function (req, res) {
	res.sendfile('/index.html', {root: __dirname});
});

app.get('/*', function (req, res, next) {
	var file = req.params[0];
	res.sendfile(__dirname + '/' + file);
	
});


require("./server.js");
var core = new Q.server_core();
core.server_initialize();
core.names=[];

core.id_sendstate = setInterval(function () {
	if (core.active)
		io.emit('on_server_update', core.server_snapshot());
}, 30);

core.bind('new_bullet', function (bullet) {
	io.emit('new_bullet', bullet);
});

core.bind('delete_bullet', function (bindex) {
	io.emit('delete_bullet', bindex);
});

core.bind('player_gameover', function (pkid) {
	io.emit('player_gameover', {id: pkid, count: core.player_count});
});

io.on("connection", function (socket) {
	
	socket.on('id_checkdup',function(id){
		if (core.names[id]==undefined)
			core.names[id]=1;
		else {
			core.names[id]+=1;
			id=id+'#'+core.names[id];
		}
		socket.emit('verified',id);
	});

	socket.on('join', function (status) {
		socket.client_id = status.id;
		core.server_add_player(status);
		io.emit('new_player', {id: status.id, count: core.player_count});
		socket.emit('init_terrain',core.terrain);
	});
	
	socket.on("client_input", function (msg) {
		core.server_handle_inputs(msg);
	});
	
	
	socket.on("disconnect", function () {
		if (core.players[socket.client_id] != undefined) {
			core.server_remove_player(socket.client_id);
			io.emit('player_disconnect', {id: socket.client_id, count: core.player_count});
		}
	});
	
});

server.listen(80, function () {
	console.log("listening on *:80");
});
