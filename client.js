var ratio = 2,
	map_width=800,
	map_height=600,


	delta_degree=2 * 3.1415926 / 360 * 100,

	color_table = ['super', 'aqua', 'Aquamarine', 'Chartreuse', 'Coral', 'LightCyan', 'LightSlateBlue', 'RoyalBlue', 'Violet', 'VioletRed', 'Purple', 'orange'],
	color_table_length = color_table.length;
	supercolor_table = [];
	supercolor_num = 7;

	animation = true;	//是否开启消失渐变等动画

var lerp = function(a,b,k) {
	return a+k*(b-a);
}

Q.client_core = Q.core.extend({
	init: function () {
		this.id = '';
		this.buffer = [];
		this.buffer_maxlength = 2000;
		this.seq = 0;

		this.state = {};
		this.old_players= {};
		this.last_players = {};

		this.anim_list = [];
		this.render_list = [];
		this.kills = 0;
		this.terrain=[];

		this.messages = {
			text: [], length: 5, tail: 0,
			newmsg: function (text) {
				this.text[this.tail] = text;
				this.tail = (this.tail + 1) % this.length;
			}
		};
		
	},

	client_initialize: function (enviroment) {
		
		this.game = {
			socket: enviroment.socket,
			keyboard: enviroment.keyboard,
			map: enviroment.map,
			ctx: enviroment.ctx
		};
		
		//彩虹色设置
		for (var i=0;i<supercolor_num;i++)
			supercolor_table[i]={color : color_table[Math.floor(Math.random() * (color_table_length - 1)) + 1],
									 w : i / supercolor_num};
		this.supercolor = this.game.ctx.createRadialGradient(0, 0, 0, 0, 0, player_size);
		for (var i=0;i<supercolor_num;i++)
			this.supercolor.addColorStop(supercolor_table[i].w,supercolor_table[i].color);
		
		//攻击设置
		this.can_atk = true;
		this.is_mouseclicked = false;
		//攻击设置结束
		
		//鼠标设置
		this.mouse_pos = {x: 0, y: 0};
		this.get_mouse_pos = function (e) {
			var rect = this.game.map.getBoundingClientRect();
			this.mouse_pos = {
				x: e.clientX - rect.left,
				y: e.clientY - rect.top
			};
		};
		this.mouse_click = function (e) {
			this.is_mouseclicked = true;
		};
		
		this.game.map.addEventListener('mousemove', (this.get_mouse_pos).bind(this));
		this.game.map.addEventListener('click', (this.mouse_click).bind(this));
		//鼠标设置结束
		
		//画布设置，原始Canvas绘制的模糊问题可以通过缩放提高清晰度
		this.game.map.width = map_width*ratio;
		this.game.map.height = map_height*ratio;
		this.game.map.style="width:"+map_width+"px;height:"+map_height+"px;";
		this.game.ctx.font = '13px "Helvetica"';
		this.game.ctx.scale(ratio,ratio);

		this.id = this.game.socket.client_id;
		this.state.bullets = [];
		this.state.boxes = [];
		this.state.players = [];
		this.state.players[this.id] = new Q.game_player(this.id);
		this.render_list[this.id]={alpha:1,size:player_size};
		this.state.players[this.id].color = Math.floor(Math.random() * color_table_length);
		if (this.id === 'xzq') this.state.players[this.id].color = 0; //Just for fun!
		
		this.game.socket.emit('join', {
			id: this.id,
			color: this.state.players[this.id].color,
		});	//向服务器发送id，颜色和出生位置
		

		this.game.socket.on('on_server_update', this.client_onserverupdate.bind(this));	//接受服务器端游戏状态并无条件更新
		
		this.game.socket.on('new_bullet', this.client_getnewbullet.bind(this));		//接受新的子弹
		this.game.socket.on('delete_bullet', this.client_deletebullet.bind(this));	//删除子弹

		this.game.socket.on('new_box', this.client_getnewbox.bind(this));				//接受新的箱子
		this.game.socket.on('box_underattack', this.client_boxunderattack.bind(this)); 	//箱子扣血
		this.game.socket.on('delete_box', this.client_deletebox.bind(this));			//删除箱子
		
		this.game.socket.on('init_surrounding', this.client_init_sur.bind(this));
		this.game.socket.on('player_gameover', this.client_gameover.bind(this));		//玩家死亡
		this.game.socket.on('new_player', this.client_newplayerjoin.bind(this));
		this.game.socket.on('player_disconnect', this.client_playerdisconnect.bind(this));
		Q.gameLoop(this.client_update.bind(this));
	},
	
	client_newplayerjoin: function (state) {
		this.messages.newmsg(state.id + ' joins the game');
		this.player_count = state.count;
		this.render_list[state.id]={alpha:1,size:player_size};
	},
	
	client_playerdisconnect: function (state) {
		this.messages.newmsg(state.id + ' disconnected');
		this.player_count = state.count;
	},
	
	client_getnewbullet: function (new_bullet) {
		//新增bullet
		this.state.bullets[new_bullet.index] = new_bullet.bullet;
	},
	
	client_deletebullet: function (index) {
		if (animation && this.state.bullets[index])
			this.client_add_animation('bullet','fadeout',this.state.bullets[index]);
		delete this.state.bullets[index];
	},

	client_getnewbox: function (new_box) {
		this.state.boxes[new_box.index] = new_box.box;
	},

	client_boxunderattack: function (info) {
		if (this.state.boxes[info.index]) {
			var b = this.state.boxes[info.index];
			if (animation)
				this.client_add_animation('box','underatk',this.state.boxes[info.index]);
			b.health.cur = info.cur;
		}
	},

	client_deletebox: function (index) {
		if (animation && this.state.boxes[index])
			this.client_add_animation('box','fadeout',this.state.boxes[index]);
		delete this.state.boxes[index];
	},

	client_init_sur: function (sur) {
		this.terrain = sur.terrain;
		this.state.bullets = sur.bullets;
		this.state.boxes = sur.boxes;
	},
	
	client_add_animation: function(type,eff,entity) {
		var anim = {};
		if (eff=='underatk' || eff=='fadeout') {
			if (!entity.size) entity.size=player_size;
			if (!entity.alpha) entity.alpha=1;
			anim = {type:type,
					eff:eff,
					entity:entity,
					origin:{alpha:entity.alpha,
							size:entity.size}};

		}
		else if (eff=='interpolation') {
			anim = {type:type,
					eff:eff,
					entity:entity.render,
					old:entity.old,
					last:entity.last,
					ip_time:0};
		}
		else if (eff=='underatk_blood') {
			anim = {type:type,
					eff:eff,
					entity:}
		}
		anim.anim_destroyable = false;
		this.anim_list.push(anim);
	},

	client_onserverupdate: function (state) {
		var temp = this.state.players;
		var authority_me;

		this.state.players=[];
		this.state.players[this.id] = temp[this.id];

		for (var index in state.players) {
			var id = state.players[index].id;
			if (id !== this.id) {

				if (animation && temp[id]) {
					if (!this.render_list[id]) this.render_list[id]={};

					//其他玩家受攻击时的闪烁动画
					if (Math.abs(temp[id].health.cur-state.players[index].health.cur)>1)
						this.client_add_animation('player','underatk',this.render_list[id]);
					
					//客户端插值动画
					this.client_add_animation('player','interpolation',{old:temp[id],
																	   last:state.players[index],
																	 render:this.render_list[id]});
					
				}

				this.state.players[id] = state.players[index];
			}
			else
				authority_me = state.players[index];
		}

		//自己受到攻击时的动画
		if (animation && authority_me)
			if (Math.abs(authority_me.health.cur-temp[this.id].health.cur)>1) {
				this.client_add_animation('player','underatk',this.render_list[this.id]);
				this.client_add_animation('window','underatk_blood');
			}

		var head = -1;
		
		for (var index in state.seqs)
			if (this.id === state.seqs[index].id) {
				head = state.seqs[index].seq;
				break;
			}
		
		
		if (head !== -1)
			if (!player_cmp(this.buffer[head].player, authority_me)) {   //历史状态比较
				console.log('Reconciliation activated. Local state has been changed by server.');
				
				//client rewind
				this.state.players[this.id] = authority_me;
				
				//client replay
				for (var i = head + 1; i !== this.seq; i = (i + 1) % this.buffer_maxlength) {
					this.process_inputs(this.state.players[this.id], this.buffer[i].input, 0.0166689);
					this.buffer[i].player = {};
					$.extend(true, this.buffer[i].player, this.state.players[this.id]);
				}
			}
	},
	
	//提取自身以及相对于画布的坐标
	client_getme: function() {
		this.me = this.state.players[this.id];
		this.mapX = Math.max(Math.min(this.me.pos.x, map_width / 2),
			this.me.pos.x - (this.global_width - map_width));
		this.mapY = Math.max(Math.min(this.me.pos.y, map_height / 2),
			this.me.pos.y - (this.global_height - map_height));
	},

	client_update_bullets: function(dt) {
		for (var index in this.state.bullets)
			if (!!this.state.bullets[index]) {
				var b = this.state.bullets[index];
				this.update_bullet_physics(b,dt);
				if (b.destroyable==true)
					this.client_deletebullet(index);
			}
	},

	client_capture_input: function() {
		var msg = {
			input: {kb: '', ms: 0},
			id: this.id,
			seq: this.seq
		};
		kb = this.game.keyboard;
		
		//获取玩家相对坐标
		this.client_getme();

		//获取键盘输入
		var km = '';
		if (kb.pressed('W')) km = km + 'w';
		if (kb.pressed('S')) km = km + 's';
		if (kb.pressed('A')) km = km + 'a';
		if (kb.pressed('D')) km = km + 'd';
		if (this.is_mouseclicked && this.can_atk) {
			km = km + 'j';
			this.can_atk = false;
			this.is_mouseclicked = false;
			setTimeout((function () {
				this.can_atk = true;
			}).bind(this), this.me.bullet_prop.reload * 1000);
		}
		msg.input.kb = km;

		//获取鼠标输入
		msg.input.ms = Math.atan((this.mouse_pos.y - this.mapY) / (this.mouse_pos.x - this.mapX));
		if (this.mouse_pos.x < this.mapX) msg.input.ms += Math.PI;

		return msg;
	},

	client_predict: function(msg,dt) {
		this.process_inputs(this.state.players[this.id], msg.input, dt);				//客户端立即更新状态
		this.buffer[this.seq] = {};
		this.buffer[this.seq].player = {};
		this.buffer[this.seq].input = msg.input;
		$.extend(true, this.buffer[this.seq].player, this.state.players[this.id]);	//深拷贝
		this.seq = (this.seq + 1) % this.buffer_maxlength;								//环状buffer
	},

	client_update: function (dt) {
		var msg = this.client_capture_input();
		
		this.game.socket.emit('client_input', msg);			//向服务器发送操作
		this.client_predict(msg, dt);

		this.client_update_bullets(dt);
		
		this.client_getme();	//更新处理完毕后的位置
		this.client_render(dt);
	},
	
	client_render_background: function () {
		var ctx = this.game.ctx;
		var me = this.state.players[this.id];
		
		ctx.save();
		ctx.lineWidth = 1;
		ctx.strokeStyle = 'rgba(136,136,136,0.1)';
		
		//核心部分，模拟网格相对世界“固定”
		var paddingX = (me.pos.x < map_width / 2 || me.pos.x > this.global_width - map_width / 2) ? 0 : this.block_width - me.pos.x % this.block_width,
			paddingY = (me.pos.y < map_height / 2 || me.pos.y > this.global_height - map_height / 2) ? 0 : this.block_height - me.pos.y % this.block_height;
		
		
		for (var i = paddingY; i < map_height; i += this.block_height) {	//绘制横线
			ctx.beginPath();
			ctx.moveTo(0, i);
			ctx.lineTo(map_width, i);
			ctx.stroke();
			
		}
		for (var i = paddingX; i < map_width; i += this.block_width) {	//绘制竖线
			ctx.beginPath();
			ctx.moveTo(i, 0);
			ctx.lineTo(i, map_height);
			ctx.stroke();
		}
		ctx.closePath();


		for (var i = paddingX - this.block_width; i < map_width; i += this.block_width) {
			block_x = Math.floor((this.me.pos.x - this.mapX + i) / this.block_width);
			for (var j = paddingY - this.block_height; j < map_height; j += this.block_height) {
				block_y = Math.floor((this.me.pos.y - this.mapY + j) / this.block_height);
			
				if (this.terrain[block_x]!=undefined) 
				if (this.terrain[block_x][block_y]!=undefined)
				if (this.terrain[block_x][block_y]==1) {
					ctx.fillStyle = 'rgb(136,136,136)';
					ctx.fillRect(block_x*this.block_width-this.me.pos.x+this.mapX,
								 block_y*this.block_height-this.me.pos.y+this.mapY,
								 this.block_width+1,this.block_height+1);
				}
			}
		}
		ctx.restore();
	},
	
	client_render_box:function (box) {
		if (!box) return;

		var ctx = this.game.ctx;
		var r = box.size;
		ctx.save();

		ctx.globalAlpha = box.alpha || 1;
		ctx.translate(box.pos.x - this.me.pos.x + this.mapX, box.pos.y - this.me.pos.y + this.mapY);
		
		//绘制轮廓							
		ctx.lineWidth = 2;
		ctx.strokeStyle = 'white';
		ctx.strokeRect(-r,-r,2*r,2*r);
		
		//填充
		ctx.fillStyle = 'lightyellow';
		ctx.fillRect(-r,-r,2*r,2*r);

		//绘制血槽
		ctx.strokeStyle = 'white';
		ctx.lineWidth = 1;
		var blood = box.health.cur / box.health.max;
		ctx.fillStyle = blood<0.41?blood<0.21?'red':'yellow':'lightgreen';								
		ctx.fillRect(-r, r + 6, blood * 2 * r, 5);
		ctx.strokeRect(-r , r + 6, 2*r, 5);

		ctx.restore();
	},

	client_render_bullet: function (bullet) {
		if (!bullet) return;

		var ctx = this.game.ctx;
		var r = bullet.size;
		ctx.save();

		ctx.globalAlpha = bullet.alpha || 1;
		ctx.translate(bullet.pos.x - this.me.pos.x + this.mapX, bullet.pos.y - this.me.pos.y + this.mapY);
		ctx.beginPath();
		ctx.arc(0, 0, r, 0, 2 * Math.PI);							//绘制圆形轮廓
		ctx.lineWidth = 4;
		ctx.strokeStyle = 'white';
		ctx.stroke();
		
		if (bullet.color > 0)
			ctx.fillStyle = color_table[bullet.color];
		else
			ctx.fillStyle = this.supercolor;

		ctx.fill();
		ctx.closePath();
		ctx.restore();
	},
	
	client_render_player: function (player) {
		if (!player) return;

		var ctx = this.game.ctx;
		var r = this.render_list[player.id]?(this.render_list[player.id].size || player_size):player_size;
		var pos = this.render_list[player.id]?(this.render_list[player.id].pos || player.pos):player.pos;
		var dir = this.render_list[player.id]?(this.render_list[player.id].dir || player.dir):player.dir;
		var health = this.render_list[player.id]?(this.render_list[player.id].health || player.health):player.health;

		ctx.save();
		ctx.globalAlpha = this.render_list[player.id]?(this.render_list[player.id].alpha || 1):1;

			//画布偏移，以玩家为中心
		ctx.translate(pos.x - this.me.pos.x + this.mapX, pos.y - this.me.pos.y + this.mapY);

			//绘制id
		ctx.fillStyle = 'white';
		ctx.fillText(player.id, -r + 3, -r - 6);

			//绘制血槽
		ctx.strokeStyle = 'white';
		ctx.lineWidth = 1;
		var blood = health.cur / health.max;
		ctx.fillStyle = blood<0.41?blood<0.21?'red':'yellow':'lightgreen';		
		ctx.fillRect(-r, r + 6, blood * 2 * r, 5);
		ctx.strokeRect(-r , r + 6, 2*r, 5);

			//绘制圆形轮廓
		ctx.beginPath();
		ctx.arc(0, 0, r, 0, 2 * Math.PI);							
		ctx.lineWidth = 5;
		ctx.strokeStyle = 'white';
		ctx.stroke();
		if (player.color > 0)									//内部填充
			ctx.fillStyle = color_table[player.color];
		else
			ctx.fillStyle = this.supercolor;
		ctx.fill();
		ctx.closePath();

		//炮口绘制
		ctx.beginPath();									
		ctx.arc(r * Math.cos(dir), r * Math.sin(dir), 5, 0, 2 * Math.PI);
		ctx.stroke();
		ctx.fillStyle = 'white';
		ctx.fill();
		ctx.closePath();
		
		
		ctx.restore();
	},
	
	client_render_message: function () {
		var ctx = this.game.ctx;
		ctx.save();
		
		ctx.font = '23px "Helvetica"';
		ctx.fillStyle = 'white';
		ctx.fillText(this.kills + ' Killed  ' + this.player_count + ' Alive', map_width - 165, 30);
		
		ctx.font = '15px "Helvetica"';
		for (var i = 0; i < this.messages.length; i++) {
			var index = (i + this.messages.tail) % this.messages.length;
			if (this.messages.text[index] !== undefined) {
				if (this.messages.text[index].indexOf('termin') !== -1)
					ctx.fillStyle = 'rgba(255,0,0,' + (i + 1) / this.messages.length + ')';
				else if (this.messages.text[index].indexOf('disconnect') !== -1)
					ctx.fillStyle = 'rgba(136,136,136,' + (i + 1) / this.messages.length + ')';
				else
					ctx.fillStyle = 'rgba(255,255,255,' + (i + 1) / this.messages.length + ')';
				ctx.fillText(this.messages.text[(i + this.messages.tail) % this.messages.length], map_width - 150, 60 + i * 20);
			}
		}
		ctx.restore();
	},
	
	//绘制逐帧动画，若为派生动画（如fade-out等实体消亡类型），需描述每一帧并额外调用client_render方法；
	//			 若为寄生动画（如underatk等寄生于实体类型），只需描述每一帧即可；
	//所有动画都以anim.anim_destroyable=true结束，外部将销毁此anim对象。
	client_render_animation: function (anim,dt) {
		if (!anim) return;
		if (anim.eff==='fadeout') {
			if (anim.type==='bullet') {
				anim.entity.alpha-=0.1;
				anim.entity.size+=0.2;
				if (anim.entity.alpha>0)
					this.client_render_bullet(anim.entity);
				else
					anim.anim_destroyable = true;
			}
			if (anim.type==='box') {
				anim.entity.alpha-=0.1;
				anim.entity.size+=0.2;
				if (anim.entity.alpha>0)
					this.client_render_box(anim.entity);
				else
					anim.anim_destroyable = true;
			}
		}
		if (anim.eff==='underatk') {
				anim.entity.alpha-=0.08;
				anim.entity.size+=0.4;
				if (anim.entity.alpha<0.25) {
					anim.entity.alpha = anim.origin.alpha;	//恢复到原始状态
					anim.entity.size = anim.origin.size;
					anim.anim_destroyable = true;
				}

		}

		if (anim.eff==='interpolation') {
			var k = anim.ip_time / this.tickrate;
			var o = anim.old;
			var l = anim.last;
			if (k>1) {
				k=1;
				anim.anim_destroyable = true;
			}
			anim.entity.pos = {x:lerp(o.pos.x,l.pos.x,k),
							   y:lerp(o.pos.y,l.pos.y,k)};
			anim.entity.health = {cur:lerp(o.health.cur,l.health.cur,k),
								  max:l.health.max};
			anim.entity.dir = lerp(o.dir,l.dir,k);
			anim.ip_time += dt;
		}
	},

	client_render: function (dt) {
		this.game.ctx.clearRect(0, 0, map_width, map_height);
		
		this.client_render_background();
		this.client_render_message();
		for (var index in this.anim_list) {
			if (!!this.anim_list[index]) {

				anim = this.anim_list[index];
				if (anim.anim_destroyable)
					delete this.anim_list[index];
				else 
					this.client_render_animation(anim,dt);
			}
		}

		for (var id in this.state.players) {
			this.client_render_player(this.state.players[id]);
		}
		for (var index in this.state.bullets) {
			if (!!this.state.bullets[index])
				this.client_render_bullet(this.state.bullets[index]);
		}
		for (var index in this.state.boxes) {
			if (!!this.state.boxes[index])
				this.client_render_box(this.state.boxes[index]);
		}
	},
	
	
	client_gameover: function (state) {
		if (state.id.pid !== this.id) {
			this.messages.newmsg(state.id.kid + ' terminates ' + state.id.pid);
			this.player_count = state.count;
			
			if (state.id.kid === this.id)		//己方确认击杀
				this.kills += 1;
		}
		else {
			this.game.socket.disconnect();
			Q.pauseGame();
			alert('You have been slained by ' + state.id.kid + '! Good luck next time!');
			this.game.map.removeEventListener('mousemove', this.get_mouse_pos);
			this.game.map.removeEventListener('click', this.mouse_click);
			$("#login").removeClass("hidden-div");
			$("#game").addClass("hidden-div");
		}
	}
});