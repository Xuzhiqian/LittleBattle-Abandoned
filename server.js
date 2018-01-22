require("./core.js");

var power2 = function (a) {
	return a * a;
};
var dis = function (a, b) {
	return Math.sqrt(power2(a.x - b.x) + power2(a.y - b.y));
};

Q.server_core = Q.core.extend({
	init: function () {
		this.player_count = 0;
		this.players = [];
		this.bullets = [];
		this.boxes = [];
		this.anim_list = [];
		this.terrain = [];
		this.inputs = [];
		this.seqs = [];
		this.active = false;
	},
	
	server_initialize: function () {
		Q.gameLoop(this.server_update.bind(this));
	},
	
	server_add_player: function (status) {
		this.players[status.id] = new Q.game_player(status.id);
		p = this.players[status.id];
		p.color = status.color;
		this.inputs[status.id] = [];
		this.player_count++;
		console.log(status.id + ' joins the game.');

		if (this.active==false) {
			this.active=true;
			this.genbox={cur:0,max:120};
			this.server_generate_terrain();
		}

		//防止出生地落在地形上
		while (this.check_terrain(p.pos)) {
			p.pos = {
				x: Math.floor(Math.random() * this.global_width),
				y: Math.floor(Math.random() * this.global_height)
			};
		}

	},
	
	//经过精心调参后比较美观的随机地形生成器，由主地形和分支地形构成，
	//主地形生成较大的类陆地形，分支地形生成零散的岛屿地形，最终两者合并。
	server_generate_terrain: function() {
		var w = this.global_width / this.block_width;
		var h = this.global_height / this.block_height;

		this.terrain = [];

      	//地形周围单元计数
      	var count=function(t,x,y,f) {
      		var c=0;
      		for (var i=x-f;i<=x+f;i++)
        		for (var j=y-f;j<=y+f;j++)
          			if (t[i]!=undefined)
            			if (t[i][j]!=undefined)
              				if (t[i][j]==1)	c++;
      		return c;
    	};

    	//地形迭代
    	var evol = function(t,opt) {
    		for (var dd=0;dd<opt.d;dd++) {
    			var _terrain=[];
    			for (var i=-1;i<=w+1;i++) {
      				_terrain[i]=[];
      				for (var j=-1;j<=h+1;j++) {
        				if (count(t,i,j,opt.w)>=opt.s)
          					_terrain[i][j]=1;
        				else
          				_terrain[i][j]=0;
      				}
    			}
    			t=_terrain;
			}
			return t;
    	};

    	//地形参数
    	var main={p:0.465 , w:2, s:13 , d:25};
    	var isle={p:0.398 , w:1, s:5  , d:20};

		//地形随机化
		this.main_terrain=[];
		this.isle_terrain=[];
  		for (var i=-3;i<=w+3;i++) {
    		this.main_terrain[i]=[];
    		this.isle_terrain[i]=[];
    		for (var j=-3;j<=h+3;j++) {
      			this.main_terrain[i][j]=Math.random()<main.p?1:0;
      			this.isle_terrain[i][j]=Math.random()<isle.p?1:0;
    		}
      	}

    	//主地形迭代
    	this.main_terrain = evol(this.main_terrain,main);

		//分支地形迭代
		this.isle_terrain = evol(this.isle_terrain,isle);

		//地形融合
		for (var i=-1;i<=w+1;i++) {
			this.terrain[i]=[];
			for (var j=-1;j<=h+1;j++)
				this.terrain[i][j]=this.main_terrain[i][j] || this.isle_terrain[i][j];
		}
	},

	server_generate_box: function() {
		var pos = {
				x: Math.floor(Math.random() * this.global_width),
				y: Math.floor(Math.random() * this.global_height)
			};
		if (this.check_terrain(pos)==true) return;
			
		var new_box = new Q.box(pos);
		var index = this.boxes.push(new_box) - 1;
		this.trigger('new_box', {box:new_box, index:index});
	},

	server_new_bullet: function (player) {
		var new_bullet = new Q.bullet(player);
		var index = this.bullets.push(new_bullet) - 1;
		this.trigger('new_bullet', {bullet: new_bullet, index: index});
	},
	
	server_delete_bullet: function (index) {
		delete this.bullets[index];
		this.trigger('delete_bullet', index);
	},

	server_delete_box: function (index) {
		delete this.boxes[index];
		this.trigger('delete_box',index);
	},
	
	server_update: function (dt) {
		if (!this.active) return;

		this.genbox.cur+=1;
		if (this.genbox.cur>=this.genbox.max) {
			this.server_generate_box();
			this.genbox.cur=0;
			this.genbox.max+=1;
		}

		this.server_update_players(dt);
		this.server_update_bullets(dt);
		this.server_update_boxes(dt);
	},
	
	server_update_players: function(dt) {
		for (var id in this.players) {
			if (this.inputs[id] != undefined) {
				
				for (var unit_index in this.inputs[id]) {
					var msg = this.inputs[id][unit_index];
					
					this.process_inputs(this.players[id], msg.input, dt);
					if (msg.input.kb.indexOf('j') != -1)
						this.server_new_bullet(this.players[id]);
					
					this.seqs[id] = msg.seq;
					
				}
				this.inputs[id] = [];
				
			}
		}
	},

	server_update_bullets: function(dt) {
		for (var index in this.bullets)
			if (!!this.bullets[index]) {
				var b = this.bullets[index];
				this.update_bullet_physics(b,dt);
				this.server_bullet_check_hit(b);
				if (b.destroyable==true) this.server_delete_bullet(index);
				
			}
	},

	server_update_boxes: function(dt) {
		for (var index in this.boxes)
			if (!!this.boxes[index]) {
				var b = this.boxes[index];
				b.update(dt);
				if (b.destroyable==true) this.server_delete_box(index);
			}
	},

	server_bullet_check_hit: function (bullet) {
		for (var id in this.players) {
			var p = this.players[id];
			if (id != bullet.owner_id)
				if (dis(bullet.pos, p.pos) < bullet.size + p.size) {
					p.health.cur -= bullet.damage;
					if (p.health.cur <= 0) {
						this.server_remove_player(id);
						this.trigger('player_gameover', {pid: id, kid: bullet.owner_id});
					}
					bullet.destroyable = true;
					break;
				}
		}

		if (bullet.destroyable) return;

		for (var index in this.boxes) {
			var b = this.boxes[index];
			if (dis(bullet.pos, b.pos) < bullet.size + b.size) {
				b.health.cur -= bullet.damage;
				if (b.health.cur <= 0) {
					this.server_player_reward(bullet.owner_id,b);
					b.destroyable = true;
				}
				bullet.destroyable = true;
				this.trigger('box_underattack',{index:index,cur:b.health.cur});
				break;
			}
		}
	},

	server_player_reward: function(pid, box) {
		if (!!this.players[pid]) {
			this.players[pid].score+=box.health.max/10;
		}
	},
	
	server_handle_inputs: function (msg) {
		if (this.inputs[msg.id] != undefined)
			this.inputs[msg.id].push(msg);
	},
	
	server_snapshot: function () {
		var state = {
			players: [],
			seqs: []
		};
		for (var id in this.players) {
			state.players.push(this.players[id]);
			if (this.seqs[id] != undefined)
				state.seqs.push({seq: this.seqs[id], id: id});
			else
				state.seqs.push({seq: -1, id: id});
		}
		this.seqs = [];
		return state;
	},
	
	server_remove_player: function (id) {
		console.log(id + ' leaves the game');
		delete this.players[id];
		delete this.inputs[id];
		delete this.seqs[id];
		this.player_count--;
		if (this.player_count <= 0) {
			this.active = false;		//没有玩家连接时服务器不再更新
			this.names=[];
			this.bullets=[];
			console.log('nobody is in the game. server deactivated.');
		}
	}
	
});