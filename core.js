
var global_width = 800,
	global_height = 600;

var global_posmin={x:0,y:0},
	global_posmax={x:global_width,y:global_height};

var player_size ={x:10,y:5};

var delta_degree = 2*3.1415926/360*100;

var v_a = function(a,b) {return {x: a.x+b.x , y: a.y+b.y}};
var v_n = function(a,b) {return {x: a.x*b   , y: a.y*b  }};

var game_core = function(flag) {
		
        this.Q = Quisus();
        this.isServer = flag == 'server';

        if (this.isServer) {
        	this.player_count=0;
        	this.players=[];
        	this.inputs=[];
        	this.seqs=[];
        	this.active = false;
        	this.state={};
        }
        else {
        	this.id = '';
        	this.buffer=[];
        	this.seq=0;
        	this.state={};
        }
};

if( 'undefined' != typeof global ) {
	var Quisus = require('./quisus.js');
    module.exports = global.game_core = game_core;
}

var game_player = function(nickname) {
	this.id = nickname;
	this.pos={x:100,y:100};
	this.health = {cur:100,max:100};
	this.dir={theta:0,x:1,y:0};
	this.speed=200;
};

var move_f = function(p,dt){p.pos=v_a(p.pos,v_n(p.dir,dt*p.speed))};
var move_b = function(p,dt){p.pos=v_a(p.pos,v_n(p.dir,-dt*p.speed))};
var turn_l = function(p,dt){
		p.dir.theta-=delta_degree*dt;
		p.dir.x=Math.cos(p.dir.theta);
		p.dir.y=Math.sin(p.dir.theta);
};
var turn_r = function(p,dt){
		p.dir.theta+=delta_degree*dt;
		p.dir.x=Math.cos(p.dir.theta);
		p.dir.y=Math.sin(p.dir.theta);
};

game_core.prototype.client_initialize = function(enviroment) {
	this.is_client_predict= true;


	this.game = {
		socket:enviroment.socket,
		keyboard:enviroment.keyboard,
		map:enviroment.map,
		ctx:enviroment.ctx
	}
	
	this.game.map.width = global_width;
	this.game.map.height = global_height;
	this.game.ctx.font = '11px "Helvetica"';
	this.id = this.game.socket.client_id;
	this.state.players=[];
	this.state.players[this.id] = new game_player(this.id);
	this.game.socket.emit('join',this.id);

	this.game.socket.on('on_server_update',this.client_onserverupdate.bind(this));	//接受服务器端游戏状态并无条件更新

	this.Q.gameLoop(this.update.bind(this));
};
game_core.prototype.client_onserverupdate=function(state) {
	console.log('I received');
	var temp_me = this.state.players[this.id];

	this.state.players=[];
	this.state.players[this.id]=temp_me;

	for (var index in state.players)
		if (state.players[index].id != this.id)
		this.state.players[state.players[index].id]=state.players[index];
	
	var head = this.seq;
	for (var index in state.seqs)
		if (this.id == state.seqs[index].id)
			head = state.seqs[index].seq;

	if (!cmp(this.buffer[head].player,state.players[this.id]))	{   //历史状态比较
		console.log('Correction entailed');
		
		//client rewind
		this.state.players[this.id]=state.players[this.id];

		//client replay
		for (var i=head+1;i<=this.seq;i++)
			this.process_inputs(this.state.players[this.id],this.buffer[i].input,0.0166666);
	}
};

game_core.prototype.server_initialize = function() {
	this.Q.gameLoop(this.update.bind(this));
};

game_core.prototype.server_add_player = function(nickname) {
	this.players[nickname]=new game_player(nickname);
	this.inputs[nickname]=[];
	this.seqs[nickname]=[];
	this.active = true;
	this.player_count++;
};

game_core.prototype.update = function(dt) {
	if (this.isServer) {
		if (this.active) this.server_update(dt);
	}
	else
		this.client_update(dt);
};

game_core.prototype.client_update = function(dt) {
	var msg = {
		input:'',
		id:this.id,
		seq:this.seq
	};
	kb = this.game.keyboard;

    if (kb.pressed('W'))
        msg.input=msg.input+'w';
    if (kb.pressed('S'))
        msg.input=msg.input+'s';
    if (kb.pressed('A'))
        msg.input=msg.input+'a';
    if (kb.pressed('D'))
        msg.input=msg.input+'d';    

    if (msg.input!='') {
    	this.game.socket.emit('client_input',msg);										//向服务器发送操作
    	if (this.is_client_predict) {
    		this.process_inputs(this.state.players[this.id],msg.input,dt);				//客户端立即更新状态

    		this.buffer[this.seq]={};
    		this.buffer[this.seq].player={};
    		this.buffer[this.seq].input=msg.input;
    		$.extend(true,this.buffer[this.seq].player,this.state.players[this.id]);	//深拷贝

    		this.seq=(this.seq+1)%200;													//循环队列，容量为200
    	}
	}
    
    
    this.client_render();
};

game_core.prototype.client_render_player = function(player) {
	var ctx = this.game.ctx;
	var rx = player_size.x;
	var ry = player_size.y;

	ctx.save();

	ctx.translate(player.pos.x,player.pos.y);			//画布偏移至玩家中心

	ctx.fillStyle = 'white';
	ctx.fillText(player.id,-rx,-ry-10);					//绘制id

	ctx.fillStyle = 'green';								//绘制血槽
	ctx.fillRect(-rx,-ry-7,player.health.cur/player.health.max*2*rx,5);


	ctx.rotate(player.dir.theta);						//倾斜theta角度

	ctx.fillStyle = 'orange';
	ctx.fillRect(-rx,-ry,2*rx,2*ry);						//绘制车身

	ctx.restore();
};

game_core.prototype.client_render = function() {
	this.game.ctx.clearRect(0,0,global_width,global_height);
	for (var id in this.state.players) {
		this.client_render_player(this.state.players[id]);
	}
};

game_core.prototype.process_inputs = function(p,inputs,dt) {
	for (var i=0;i<inputs.length;i++) {
				switch (inputs[i]) {
					case 'w':
						move_f(p,dt);
						break;
					case 's':
						move_b(p,dt);
						break;
					case 'a':
						turn_l(p,dt);
						break;
					case 'd':
						turn_r(p,dt);
						break;
				}
			}
	this.check_collision(p);
};

game_core.prototype.server_update = function(dt) {
	for (var id in this.players) {
		if (this.inputs[id]!=undefined) {

			this.seqs[id]=-1;
			for (var unit_index in this.inputs[id]) {
				var msg=this.inputs[id][unit_index];

				this.process_inputs( this.players[id] , msg.input , dt );
				if (msg.seq>this.seqs[id])
					this.seqs[id]=msg.seq;

			}
			this.inputs[id]=[];

		}
	}
};

game_core.prototype.check_collision = function(player) {
	if (player.pos.x < 0) player.pos.x=0;
	if (player.pos.y < 0) player.pos.y=0;
	if (player.pos.x > global_width) player.pos.x=global_width;
	if (player.pos.y > global_height) player.pos.y=global_height;
};
game_core.prototype.server_handle_inputs = function(msg) {
	if (this.inputs[msg.id]!=undefined)
		if (Math.random()<0.8)
			this.inputs[msg.id].push(msg);
};

game_core.prototype.server_snapshot = function() {
	var state = {
		players:[],
		seqs:[]
	};
	for (var id in this.players) {
		state.players.push(this.players[id]);
		state.seqs.push({seq:this.seqs[id],id:id});
	}
	return state;
};

game_core.prototype.server_remove_player = function(id) {
	console.log(id + ' leaves the game');
	delete this.players[id];
	delete this.inputs[id];
	this.player_count--;
	if (this.player_count<=0) {
		this.active = false;		//没有玩家连接时服务器不再更新
		console.log('nobody is in the game. deactivated.');
	}
}

var cmp = function( x, y ) {  
        // If both x and y are null or undefined and exactly the same
        if ( x === y ) {  
            return true;  
        }  
  
        // If they are not strictly equal, they both need to be Objects
        if ( ! ( x instanceof Object ) || ! ( y instanceof Object ) ) {  
            return false;  
        }  
  
        // They must have the exact same prototype chain, the closest we can do is
        // test the constructor.
        if ( x.constructor !== y.constructor ) {  
            return false;  
        }  
  
        for ( var p in x ) {  
            // Inherited properties were tested using x.constructor === y.constructor
            if ( x.hasOwnProperty( p ) ) {  
                // Allows comparing x[ p ] and y[ p ] when set to undefined
                if ( ! y.hasOwnProperty( p ) ) {  
                    return false;  
                }  
  
                // If they have the same strict value or identity then they are equal
                if ( x[ p ] === y[ p ] ) {  
                    continue;  
                }  
  
                // Numbers, Strings, Functions, Booleans must be strictly equal
                if ( typeof( x[ p ] ) !== "object" ) {  
                    return false;  
                }  
  
                // Objects and Arrays must be tested recursively
                if ( ! Object.is( x[ p ],  y[ p ] ) ) {  
                    return false;  
                }  
            }  
        }  
  
        for ( p in y ) {  
            // allows x[ p ] to be set to undefined
            if ( y.hasOwnProperty( p ) && ! x.hasOwnProperty( p ) ) {  
                return false;  
            }  
        }  
        return true;  
    };  

