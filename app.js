global.window = global.document = global;

var app = require("express")();
var server = require("http").Server(app);
var io = require("socket.io").listen(server);


app.get('/', function (req, res) {
	res.sendFile('/index.html', {root: __dirname});
});

app.get('/*', function (req, res, next) {
	var file = req.params[0];
	res.sendFile(__dirname + '/' + file);
	
});

sockets = [];
require("./server.js");
var core = new Q.server_core();
core.server_initialize();
core.names=[];

core.id_sendstate = setInterval(function () {
	if (core.active)
		io.volatile.send(JSON.stringify(core.server_snapshot()));
}, core.tickrate);

core.bind('new_bullet', function (bullet) {
	io.emit('new_bullet', bullet);
});

core.bind('delete_bullet', function (bindex) {
	io.emit('delete_bullet', bindex);
});

core.bind('new_box', function (box) {
	io.emit('new_box', box);
});

core.bind('new_weapon', function (wpn) {
	io.emit('new_weapon', wpn);
});

core.bind('delete_weapon', function (windex) {
	io.emit('delete_weapon',windex);
});

core.bind('box_underattack', function(info) {
	io.emit('box_underattack',info);
});

core.bind('delete_box', function (bindex) {
	io.emit('delete_box', bindex);
});

core.bind('player_reward',function(reward_info) {
	for (var id in sockets) {
		if (sockets[id]!=null && id==reward_info.id)
			sockets[id].emit('player_reward',reward_info.reward);
	}
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
		sockets[status.id] = socket;
		socket.client_id = status.id;
		core.server_add_player(status);
		io.emit('new_player', {id: status.id, count: core.player_count});
		
		var players=[];
		for (var id in core.players)
			players.push(core.players[id]);
		socket.emit('init_surrounding',{terrain:core.terrain,boxes:core.boxes,bullets:core.bullets,players:players,weapons:core.weapons});
	});
	
	socket.on('message', function (msg) {
		msg = core.decompressInput(msg);
		msg.id = socket.client_id;
		core.server_handle_inputs(msg);
	});
	
	
	socket.on("disconnect", function () {
		if (core.players[socket.client_id] != undefined) {
			core.server_remove_player(socket.client_id);
			delete sockets[socket.client_id];
			io.emit('player_disconnect', {id: socket.client_id, count: core.player_count});
		}
	});
	
});

server.listen(4004, function () {
	console.log("listening on *:80");
});
