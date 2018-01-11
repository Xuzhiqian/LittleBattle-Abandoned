Q.client_core = Q.core.extend({
	init: function () {
		this.id = '';
		this.buffer = [];
		this.buffer_maxlength = 2000;
		this.seq = 0;
		this.state = {};
		this.kills = 0;
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
		this.supercolor = this.game.ctx.createRadialGradient(0, 0, 0, 0, 0, player_size);
		this.supercolor.addColorStop(0, color_table[Math.floor(Math.random() * (color_table_length - 1)) + 1]);
		this.supercolor.addColorStop(0.24, color_table[Math.floor(Math.random() * (color_table_length - 1)) + 1]);
		this.supercolor.addColorStop(0.40, color_table[Math.floor(Math.random() * (color_table_length - 1)) + 1]);
		this.supercolor.addColorStop(0.52, color_table[Math.floor(Math.random() * (color_table_length - 1)) + 1]);
		this.supercolor.addColorStop(0.63, color_table[Math.floor(Math.random() * (color_table_length - 1)) + 1]);
		this.supercolor.addColorStop(0.76, color_table[Math.floor(Math.random() * (color_table_length - 1)) + 1]);
		this.supercolor.addColorStop(0.90, color_table[Math.floor(Math.random() * (color_table_length - 1)) + 1]);
		//彩虹色设置结束
		
		//攻击设置
		this.attack_cd = 1;
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
		
		this.game.map.width = map_width;
		this.game.map.height = map_height;
		this.game.ctx.font = '13px "Helvetica"';
		this.id = this.game.socket.client_id;
		this.state.bullets = [];
		this.state.players = [];
		this.state.players[this.id] = new Q.game_player(this.id);
		this.state.players[this.id].color = Math.floor(Math.random() * color_table_length);
		
		if (this.id === 'xzq') this.state.players[this.id].color = 0; //Just for fun!
		
		this.game.socket.emit('join', {
			id: this.id,
			color: this.state.players[this.id].color,
			pos: {
				x: this.state.players[this.id].pos.x,
				y: this.state.players[this.id].pos.y
			}
		});	//向服务器发送id，颜色和出生位置
		
		this.game.socket.on('on_server_update', this.client_onserverupdate.bind(this));	//接受服务器端游戏状态并无条件更新
		this.game.socket.on('new_bullet', this.client_getnewbullet.bind(this));		//接受新的子弹
		this.game.socket.on('delete_bullet', this.client_deletebullet.bind(this));	//删除子弹
		this.game.socket.on('player_gameover', this.client_gameover.bind(this));		//玩家死亡
		this.game.socket.on('new_player', this.client_newplayerjoin.bind(this));
		this.game.socket.on('player_disconnect', this.client_playerdisconnect.bind(this));
		Q.gameLoop(this.client_update.bind(this));
	},
	
	client_newplayerjoin: function (state) {
		this.messages.newmsg(state.id + ' joins the game');
		this.player_count = state.count;
		
	},
	
	client_playerdisconnect: function (state) {
		this.messages.newmsg(state.id + ' disconnected');
		this.player_count = state.count;
	},
	
	client_getnewbullet: function (new_bullet) {
		//新增bullet
		
		this.state.bullets[new_bullet.index] = new_bullet.bullet;
		this.state.bullets[new_bullet.index].update = Q.bullet.prototype.update;
	},
	
	client_deletebullet: function (index) {
		delete this.state.bullets[index];
	},
	
	client_onserverupdate: function (state) {
		var temp_me = this.state.players[this.id];
		var authority_me;
		
		this.state.players = [];
		this.state.players[this.id] = temp_me;
		
		for (var index in state.players)
			if (state.players[index].id !== this.id)
				this.state.players[state.players[index].id] = state.players[index];
			else
				authority_me = state.players[index];
		
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
					this.process_inputs(this.state.players[this.id], this.buffer[i].input, 0.0166689, false);
					this.buffer[i].player = {};
					$.extend(true, this.buffer[i].player, this.state.players[this.id]);
				}
			}
	},
	
	client_update: function (dt) {
		var msg = {
			input: {kb: '', ms: 0},
			id: this.id,
			seq: this.seq
		};
		kb = this.game.keyboard;
		
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
			}).bind(this), this.attack_cd * 1000);
		}
		msg.input.kb = km;
		
		//获取玩家相对坐标
		this.me = this.state.players[this.id];
		this.mapX = Math.max(Math.min(this.me.pos.x, map_width / 2),
			this.me.pos.x - (global_width - map_width));
		this.mapY = Math.max(Math.min(this.me.pos.y, map_height / 2),
			this.me.pos.y - (global_height - map_height));
		
		//获取鼠标输入
		msg.input.ms = Math.atan((this.mouse_pos.y - this.mapY) / (this.mouse_pos.x - this.mapX));
		if (this.mouse_pos.x < this.mapX) msg.input.ms += Math.PI;								//反正切角度补偿
		
		
		this.game.socket.emit('client_input', msg);										//向服务器发送操作
		this.process_inputs(this.state.players[this.id], msg.input, dt, false);				//客户端立即更新状态
		this.buffer[this.seq] = {};
		this.buffer[this.seq].player = {};
		this.buffer[this.seq].input = msg.input;
		$.extend(true, this.buffer[this.seq].player, this.state.players[this.id]);	//深拷贝
		
		this.seq = (this.seq + 1) % this.buffer_maxlength;								//环状buffer
		//更新所有子弹
		for (var index in this.state.bullets)
			if (!!this.state.bullets[index]) {
				this.state.bullets[index].update(dt);
				if (this.state.bullets[index].life.cur > this.state.bullets[index].life.max)
					delete this.state.bullets[index];
			}
		
		this.client_render();
	},
	
	client_render_background: function () {
		var ctx = this.game.ctx;
		var me = this.state.players[this.id];
		
		ctx.save();
		ctx.lineWidth = 1;
		ctx.strokeStyle = 'rgba(136,136,136,0.25)';
		
		var stepX = 50, stepY = 50;					//网格间距
		
		//核心部分，模拟网格相对世界“固定”
		var paddingX = (me.pos.x < map_width / 2 || me.pos.x > global_width - map_width / 2) ? 0 : stepX - me.pos.x % stepX,
			paddingY = (me.pos.y < map_height / 2 || me.pos.y > global_height - map_height / 2) ? 0 : stepY - me.pos.y % stepY;
		
		
		for (var i = paddingY; i < map_height; i += stepY) {	//绘制横线
			ctx.beginPath();
			ctx.moveTo(0, i);
			ctx.lineTo(map_width, i);
			ctx.stroke();
		}
		for (var i = paddingX; i < map_width; i += stepX) {	//绘制竖线
			ctx.beginPath();
			ctx.moveTo(i, 0);
			ctx.lineTo(i, map_height);
			ctx.stroke();
		}
		ctx.restore();
	},
	
	client_render_bullet: function (bullet) {
		var ctx = this.game.ctx;
		var r = bullet.size;
		ctx.save();
		//子弹消失动画设置
		ctx.globalAlpha = (bullet.life.cur > bullet.life.max - 0.5) ? Math.max(bullet.life.max - bullet.life.cur, 0) * 2 : 1;
		ctx.translate(bullet.pos.x - this.me.pos.x + this.mapX, bullet.pos.y - this.me.pos.y + this.mapY);
		
		ctx.beginPath();
		ctx.arc(0, 0, r, 0, 2 * Math.PI);							//绘制圆形轮廓
		ctx.lineWidth = 4;
		ctx.strokeStyle = 'white';
		ctx.stroke();
		
		if (bullet.color > 0)									//内部填充
			ctx.fillStyle = color_table[bullet.color];
		else
			ctx.fillStyle = this.supercolor;
		
		ctx.fill();
		ctx.closePath();
		ctx.restore();
	},
	
	client_render_player: function (player) {
		var ctx = this.game.ctx;
		var r = player.size;
		
		ctx.save();
		
		ctx.translate(player.pos.x - this.me.pos.x + this.mapX, player.pos.y - this.me.pos.y + this.mapY);			//画布偏移至玩家中心
		
		ctx.fillStyle = 'white';
		ctx.fillText(player.id, -r, -r - 12);					//绘制id
		
		ctx.fillStyle = 'green';								//绘制血槽
		ctx.fillRect(-r, -r - 9, player.health.cur / player.health.max * 2 * r, 5);
		
		ctx.beginPath();
		ctx.arc(0, 0, r, 0, 2 * Math.PI);							//绘制圆形轮廓
		ctx.lineWidth = 5;
		ctx.strokeStyle = 'white';
		ctx.stroke();
		if (player.color > 0)									//内部填充
			ctx.fillStyle = color_table[player.color];
		else
			ctx.fillStyle = this.supercolor;
		
		ctx.fill();
		ctx.closePath();
		
		ctx.beginPath();									//炮口绘制
		ctx.arc(r * Math.cos(player.dir), r * Math.sin(player.dir), 5, 0, 2 * Math.PI);
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
		
		ctx.font = '14px "Helvetica"';
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
	
	client_render: function () {
		this.game.ctx.clearRect(0, 0, map_width, map_height);
		
		this.client_render_background();
		this.client_render_message();
		for (var id in this.state.players) {
			this.client_render_player(this.state.players[id]);
		}
		for (var index in this.state.bullets) {
			if (this.state.bullets[index] !== undefined)
				this.client_render_bullet(this.state.bullets[index]);
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