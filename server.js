global.window = global.document = global;

var app = require("express")();
var server = require("http").Server(app);
var io = require("socket.io").listen(server);
require("./core.js");

app.get( '/', function( req, res ){
        res.sendfile( '/index.html' , { root:__dirname });
});

app.get( '/*' , function( req, res, next ) {
        var file = req.params[0];
        res.sendfile( __dirname + '/' + file );

}); 

var core = new game_core("server");
core.server_initialize();

io.on("connection", function(socket){

    socket.on("join", function(status){
        core.server_add_player(status);
        socket.client_id = status.id;
    });
    
    socket.on("client_input", function(msg){
        core.server_handle_inputs(msg);
    });
      
    core.id_sendstate = setInterval(function(){
        if (core.active)
            io.emit('on_server_update',core.server_snapshot());
    },30);

    socket.on("disconnect", function(){
        core.server_remove_player(socket.client_id);
    });
  
});

server.listen(80, function(){
    console.log("listening on *:80");
});
