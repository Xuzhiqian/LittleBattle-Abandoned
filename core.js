
	var global_width = 2000,
		global_height = 1500;

	var map_width = 800;
	var map_height = 600;

	var global_posmin={x:0,y:0},
		global_posmax={x:global_width,y:global_height};

	var player_size = 12;

	var color_table=['super','aqua','Aquamarine','Chartreuse','Coral','LightCyan','LightSlateBlue','RoyalBlue','Violet','VioletRed','Purple','orange']
	var color_table_length = color_table.length;

	var delta_degree = 2*3.1415926/360*100;

	var v_a = function(a,b) {return {x: a.x+b.x , y: a.y+b.y}};
	var v_n = function(a,b) {return {x: a.x*b   , y: a.y*b  }};


var game_core = function(flag) {
		
        this.Q = Quisus();
        this.isServer = flag == 'server';

        if (this.isServer) {
        	this.player_count=0;
        	this.players=[];
        	this.bullets=[];
        	this.inputs=[];
        	this.seqs=[];
        	this.active = false;
        	this.state={};
        }
        else {
        	this.id = '';
        	this.buffer=[];
        	this.buffer_maxlength = 2000;
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
	this.pos={x:Math.floor(Math.random()*global_width),
			  y:Math.floor(Math.random()*global_height)};
	this.health = {cur:100,max:100};
	this.speed={x:{cur:0,max:120,acc:180},y:{cur:0,max:100,acc:180}};
	this.dir = 0;
	this.color=0;
};

var move_u = function(p,dt) {
	p.speed.y.cur=Math.max(p.speed.y.cur-dt*p.speed.y.acc,-p.speed.y.max);  
};
var move_d = function(p,dt) {
	p.speed.y.cur=Math.min(p.speed.y.cur+dt*p.speed.y.acc,p.speed.y.max);  
};
var move_l = function(p,dt){
	p.speed.x.cur=Math.max(p.speed.x.cur-dt*p.speed.x.acc,-p.speed.x.max);  
};
var move_r = function(p,dt){
	p.speed.x.cur=Math.min(p.speed.x.cur+dt*p.speed.x.acc,p.speed.x.max);  
};

var update_player_physics = function(p,dt,is_no_x,is_no_y){
	if (is_no_x) {
		if (p.speed.x.cur>0)
			p.speed.x.cur = Math.max(0,p.speed.x.cur-dt*p.speed.x.acc);
		else
			p.speed.x.cur = Math.min(0,p.speed.x.cur+dt*p.speed.x.acc);
	}
	if (is_no_y) {
		if (p.speed.y.cur>0)
			p.speed.y.cur = Math.max(0,p.speed.y.cur-dt*p.speed.y.acc);
		else
			p.speed.y.cur = Math.min(0,p.speed.y.cur+dt*p.speed.y.acc);
	}
	p.pos.x=p.pos.x+p.speed.x.cur*dt;
	p.pos.y=p.pos.y+p.speed.y.cur*dt;
	if (p.pos.x<0) p.pos.x=0;
	if (p.pos.y<0) p.pos.y=0;
	if (p.pos.x>global_width) 	p.pos.x=global_width;
	if (p.pos.y>global_height) 	p.pos.y=global_height;
}

var bullet = function(start_pos,start_dir,color) {
	this.pos = {x:start_pos.x,y:start_pos.y};
	this.speed = 240;
	this.life = {cur:0,max:6};
	this.dir = {x:Math.cos(start_dir),y:Math.sin(start_dir)};
	this.color=color;
}

bullet.prototype.update = function(dt){
	this.pos = v_a(this.pos,v_n(this.dir,dt*this.speed));
	if (this.pos.x<0) {
		this.pos.x=0;
		this.dir.x=-this.dir.x;
	}
	if (this.pos.y<0) {
		this.pos.y=0;
		this.dir.y=-this.dir.y;
	}
	if (this.pos.x>global_width) {
		this.pos.x=global_width;
		this.dir.x=-this.dir.x;
	}
	if (this.pos.y>global_height) {
		this.pos.y=global_height;
		this.dir.y=-this.dir.y;
	}
	this.life.cur+=dt;
}


game_core.prototype.client_initialize = function(enviroment) {
	this.is_client_predict= true;
	this.mf_total=0;
    this.mf_count=0;


	this.game = {
		socket:enviroment.socket,
		keyboard:enviroment.keyboard,
		map:enviroment.map,
		ctx:enviroment.ctx
	}

  	//彩虹色设置
  	this.supercolor  = this.game.ctx.createRadialGradient(0,0,0,0,0,player_size);
  	this.supercolor.addColorStop(0,color_table[Math.floor(Math.random()*(color_table_length-1))+1]);      
  	this.supercolor.addColorStop(0.24,color_table[Math.floor(Math.random()*(color_table_length-1))+1]); 
  	this.supercolor.addColorStop(0.40,color_table[Math.floor(Math.random()*(color_table_length-1))+1]);
  	this.supercolor.addColorStop(0.52,color_table[Math.floor(Math.random()*(color_table_length-1))+1]);
  	this.supercolor.addColorStop(0.63,color_table[Math.floor(Math.random()*(color_table_length-1))+1]);
  	this.supercolor.addColorStop(0.76,color_table[Math.floor(Math.random()*(color_table_length-1))+1]);
  	this.supercolor.addColorStop(0.90,color_table[Math.floor(Math.random()*(color_table_length-1))+1]);
  	//彩虹色设置结束
	
	//攻击设置
	this.attack_cd = 1;
	this.can_atk = true;
	this.is_mouseclicked = false;
	//攻击设置结束

	//鼠标设置
	this.mouse_pos={x:0,y:0};
	this.game.map.addEventListener('mousemove', (function(e) {
		var rect = this.game.map.getBoundingClientRect();
		this.mouse_pos = {x:e.clientX-rect.left,
						  y:e.clientY-rect.top};
	}).bind(this));

	this.game.map.addEventListener('click', (function(e) {
		this.is_mouseclicked=true;
	}).bind(this));
	//鼠标设置结束

	this.game.map.width = map_width;
	this.game.map.height = map_height;
	this.game.ctx.font = '13px "Helvetica"';
	this.id = this.game.socket.client_id;
	this.state.players=[];
	this.state.players[this.id] = new game_player(this.id);
	this.state.players[this.id].color = Math.floor(Math.random()*color_table_length);

	if (this.id=='xzq') this.state.players[this.id].color=0; //Just for fun!

	this.game.socket.emit('join',{id:this.id,
							   color:this.state.players[this.id].color,
							     pos:{x:this.state.players[this.id].pos.x,
							          y:this.state.players[this.id].pos.y}});

	this.game.socket.on('on_server_update',this.client_onserverupdate.bind(this));	//接受服务器端游戏状态并无条件更新
	this.Q.gameLoop(this.update.bind(this));
};
game_core.prototype.client_onserverupdate=function(state) {
	this.state.bullets=state.bullets;

	var temp_me = this.state.players[this.id];
	var authority_me;

	this.state.players=[];
	this.state.players[this.id]=temp_me;

	for (var index in state.players)
		if (state.players[index].id != this.id)
			this.state.players[state.players[index].id]=state.players[index];
		else
			authority_me = state.players[index];
	
	var head = -1;

	for (var index in state.seqs)
		if (this.id == state.seqs[index].id) {
			head = state.seqs[index].seq;
			break;
		}


	if (head!=-1)
	  if (!player_cmp(this.buffer[head].player,authority_me))	{   //历史状态比较
		console.log('Correction entailed');
		
		//client rewind
		this.state.players[this.id]=authority_me;

		//client replay
		for (var i=head+1;i!=this.seq;i=(i+1)%this.buffer_maxlength) {
			this.process_inputs(this.state.players[this.id],this.buffer[i].input,0.0166689);
			this.buffer[i].player={};
			$.extend(true,this.buffer[i].player,this.state.players[this.id]);
		}
	}
};

game_core.prototype.server_initialize = function() {
	this.Q.gameLoop(this.update.bind(this));
};

game_core.prototype.server_add_player = function(status) {
	this.players[status.id]=new game_player(status.id);
	this.players[status.id].color = status.color;
	this.players[status.id].pos = status.pos;
	this.inputs[status.id]=[];
	this.active = true;
	this.player_count++;
	console.log(status.id+' join the game.');
};

game_core.prototype.update = function(dt) {
	if (this.isServer) {
		if (this.active) this.server_update(dt);
	}
	else {
		this.client_update(dt);
		/*
		if (dt>0) {
		this.mf_total+=dt;
		this.mf_count++;
		if (this.mf_count%100==0) {
			console.log('second pre frame(avg):'+this.mf_total/this.mf_count+'\nfps:'+this.mf_count/this.mf_total);
		}
		}
		*/
	}
};

game_core.prototype.client_update = function(dt) {
	var msg = {
		input:{kb:'',ms:0},
		id:this.id,
		seq:this.seq
	};
	kb = this.game.keyboard;

	//获取键盘输入
	var km = '';
    if (kb.pressed('W'))	km=km+'w';
    if (kb.pressed('S'))	km=km+'s';
    if (kb.pressed('A'))	km=km+'a';
    if (kb.pressed('D'))	km=km+'d';
    if (this.is_mouseclicked && this.can_atk) {
    	km=km+'j';
    	this.can_atk=false;
    	this.is_mouseclicked=false;
    	setTimeout((function(){this.can_atk=true;}).bind(this),this.attack_cd*1000);
    }
    msg.input.kb = km;

    //获取鼠标输入
    msg.input.ms = Math.atan((this.mouse_pos.y-map_height/2)/(this.mouse_pos.x-map_width/2));
    if (this.mouse_pos.x<map_width/2) msg.input.ms+=Math.PI;


    	this.game.socket.emit('client_input',msg);										//向服务器发送操作
    	if (this.is_client_predict) {
    		this.process_inputs(this.state.players[this.id],msg.input,dt);				//客户端立即更新状态

    		this.buffer[this.seq]={};
    		this.buffer[this.seq].player={};
    		this.buffer[this.seq].input=msg.input;
    		$.extend(true,this.buffer[this.seq].player,this.state.players[this.id]);	//深拷贝

    		this.seq=(this.seq+1)%this.buffer_maxlength;													//循环队列，容量为200
    	}
    
    
    this.client_render();
};

game_core.prototype.client_render_background = function() {
	var ctx = this.game.ctx;
	var me = this.state.players[this.id];

	ctx.save();
	ctx.lineWidth=1;
	ctx.strokeStyle = 'rgba(136,136,136,0.25)';

	var stepX = 50, stepY = 50;
	var border_r = Math.min(map_width/2,global_width-me.pos.x)+map_width/2,
		border_d = Math.min(map_height/2,global_height-me.pos.y)+map_height/2,
		border_l = map_width/2-Math.min(map_width/2,me.pos.x);
		border_u = map_height/2-Math.min(map_height/2,me.pos.y);

	var paddingX = (me.pos.x<map_width/2)?0:stepX-me.pos.x%stepX,
		paddingY = (me.pos.y<map_height/2)?0:stepY-me.pos.y%stepY;


	for (var i = paddingY + border_u ;i<border_d+0.5;i+=stepY) {	//绘制横线
		ctx.beginPath();
		ctx.moveTo(border_l,i);
		ctx.lineTo(border_r,i);
		ctx.stroke();
	}
	for (var i = paddingX + border_l ;i<border_r+0.5;i+=stepX) {	//绘制竖线
		ctx.beginPath();
		ctx.moveTo(i,border_u);
		ctx.lineTo(i,border_d);
		ctx.stroke();
	}
	ctx.restore();
};

game_core.prototype.client_render_bullet = function(bullet) {
	var ctx = this.game.ctx;
	var r = 6;
	var me = this.state.players[this.id];

    if (Math.abs(bullet.pos.x-me.pos.x)>map_width/2 ||
		Math.abs(bullet.pos.y-me.pos.y)>map_height/2) return;	 //超出视野


	ctx.save();
	ctx.translate(bullet.pos.x-me.pos.x+map_width/2,bullet.pos.y-me.pos.y+map_height/2);

	ctx.beginPath();
	ctx.arc(0,0,r,0,2*Math.PI);							//绘制圆形轮廓
	ctx.lineWidth = 4;
	ctx.strokeStyle = 'white';
	ctx.stroke();

	if (bullet.color>0)									//内部填充
		ctx.fillStyle = color_table[bullet.color];
	else 
		ctx.fillStyle=this.supercolor;

	ctx.fill();
	ctx.closePath();
	ctx.restore();
};

game_core.prototype.client_render_player = function(player) {
	var ctx = this.game.ctx;
	var r = player_size;
	var me = this.state.players[this.id];

	if (Math.abs(player.pos.x-me.pos.x)>map_width/2 ||
		Math.abs(player.pos.y-me.pos.y)>map_height/2) return;	 //超出视野

	ctx.save();

	ctx.translate(player.pos.x-me.pos.x+map_width/2,player.pos.y-me.pos.y+map_height/2);			//画布偏移至玩家中心

	ctx.fillStyle = 'white';
	ctx.fillText(player.id,-r,-r-12);					//绘制id

	ctx.fillStyle = 'green';								//绘制血槽
	ctx.fillRect(-r,-r-9,player.health.cur/player.health.max*2*r,5);

	ctx.beginPath();
	ctx.arc(0,0,r,0,2*Math.PI);							//绘制圆形轮廓
	ctx.lineWidth = 5;
	ctx.strokeStyle = 'white';
	ctx.stroke();
	if (player.color>0)									//内部填充
		ctx.fillStyle = color_table[player.color];
	else 
		ctx.fillStyle=this.supercolor;

	ctx.fill();
	ctx.closePath();

	ctx.beginPath();									//炮口绘制
	ctx.arc(r*Math.cos(player.dir),r*Math.sin(player.dir),5,0,2*Math.PI);
	ctx.stroke();
	ctx.fillStyle='white';
	ctx.fill();
	ctx.closePath();	


	ctx.restore();
};

game_core.prototype.client_render = function() {
	this.game.ctx.clearRect(0,0,map_width,map_height);

	this.client_render_background();
	for (var id in this.state.players) {
		this.client_render_player(this.state.players[id]);
	}
	for (var index in this.state.bullets) {
		if (this.state.bullets[index]!=undefined)
		this.client_render_bullet(this.state.bullets[index]);
	}
};

game_core.prototype.process_inputs = function(p,inputs,dt) {

	for (var i=0;i<inputs.kb.length;i++) {
				switch (inputs.kb[i]) {
					case 'w':
						move_u(p,dt);
						break;
					case 's':
						move_d(p,dt);
						break;
					case 'a':
						move_l(p,dt);
						break;
					case 'd':
						move_r(p,dt);
						break;				
					case 'j':
						if (this.isServer) this.bullets.push(new bullet(p.pos,p.dir,p.color));
						break;
						
				}
			}
	update_player_physics(p,dt,(inputs.kb.indexOf('a')<0 && inputs.kb.indexOf('d')<0),
							   (inputs.kb.indexOf('w')<0 && inputs.kb.indexOf('s')<0));
	p.dir = inputs.ms;
	
};

game_core.prototype.server_update = function(dt) {
	for (var id in this.players) {
		if (this.inputs[id]!=undefined) {

			for (var unit_index in this.inputs[id]) {
				var msg=this.inputs[id][unit_index];

				this.process_inputs( this.players[id] , msg.input , dt );
				this.seqs[id]=msg.seq;

			}
			this.inputs[id]=[];

		}
	}
	for (var index in this.bullets) {
		this.bullets[index].update(dt);
		if (this.bullets[index].life.cur>this.bullets[index].life.max) delete this.bullets[index];
	}
};

game_core.prototype.server_handle_inputs = function(msg) {
	if (this.inputs[msg.id]!=undefined)
			this.inputs[msg.id].push(msg);
};

game_core.prototype.server_snapshot = function() {
	var state = {
		players:[],
		bullets:this.bullets,
		seqs:[]
	};
	for (var id in this.players) {
		state.players.push(this.players[id]);
		if (this.seqs[id]!=undefined)
			state.seqs.push({seq:this.seqs[id],id:id});
		else
			state.seqs.push({seq:-1,id:id});
	}
	this.seqs=[];
	return state;
};

game_core.prototype.server_remove_player = function(id) {
	console.log(id + ' leaves the game');
	delete this.players[id];
	delete this.inputs[id];
	this.player_count--;
	if (this.player_count<=0) {
		this.active = false;		//没有玩家连接时服务器不再更新
		console.log('nobody is in the game. server deactivated.');
	}
}

var player_cmp = function( x, y ) {  

    var isNumber = function(x) {return (typeof x =='number');};
    var isString = function(x) {return (typeof x =='string');};
    var isObject = function(x) {return (typeof x =='object');};

        if (x===y) return true;
        for ( var p in x ) {  
            // Inherited properties were tested using x.constructor === y.constructor
            if ( x.hasOwnProperty( p ) ) {  
                // Allows comparing x[ p ] and y[ p ] when set to undefined
                if ( ! y.hasOwnProperty( p ) ) {  
                    return false;  
                }  
  
                // If they have the same strict value or identity then they are equal
                if ( x[ p ] === y[ p ]) continue;

                if (isString(x[p]) || isString(y[p]))
                    if (x[p]!==y[p]) return false;
                        else continue;

                if ((isNumber(x[p]) && !isNumber(y[p]))||(!isNumber(x[p]) && isNumber(y[p])))
                    return false;
                else if (isNumber(x[p]))
                        if (Math.abs(x[p]-y[p])>0.01)
                            return false;
                        else continue;

                if (isObject(x[p]) && isObject(y[p])) {
                    if (player_cmp(x[p],y[p])==false)
                        return false;
                }
                else return false;
            }  
        }  
        return true;  
    }; 

