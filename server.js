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
		this.players[status.id].color = status.color;
		this.players[status.id].pos = status.pos;
		this.inputs[status.id] = [];
		this.player_count++;
		console.log(status.id + ' joins the game.');

		if (this.active==false) {
			this.active=true;
			this.server_generate_terrain();
		}
	},
	
	//经过精心调参后比较美观的随机地形生成器，其中初始覆盖率=0.432，地形迭代生存指数=5，迭代次数=10
	//参考元胞自动机
	server_generate_terrain: function() {
		var w = this.global_width / this.block_width;
		var h = this.global_height / this.block_height;

		//地形随机化
		this.terrain=[]
  		for (var i=0;i<h;i++) {
    		this.terrain[i]=[];
    		for (var j=0;j<w;j++)
      			this.terrain[i][j]=Math.random()<0.432?1:0;
      	}

      	//地形周围单元计数
      	var count=function(t,x,y) {
      		var c=0;
      		for (var i=x-1;i<=x+1;i++)
        		for (var j=y-1;j<=y+1;j++)
          			if (t[i]!=undefined)
            			if (t[i][j]!=undefined)
              				if (t[i][j]==1)	c++;
      		return c;
    	};

    	//10次迭代演算
    	for (var dd=0;dd<10;dd++) {
    		var _terrain=[];
    		for (var i=0;i<h;i++) {
      			_terrain[i]=[];
      			for (var j=0;j<w;j++) {
        			if (count(this.terrain,i,j)>=5)
          				_terrain[i][j]=1;
        			else
          			_terrain[i][j]=0;
      			}
    		}
    		this.terrain=_terrain;
		};
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
	
	server_update: function (dt) {
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
		for (var index in this.bullets)
			if (!!this.bullets[index]) {
				this.bullets[index].update(dt);
				if (this.bullets[index].life.cur > this.bullets[index].life.max ||
					this.server_bullet_check_hit(this.bullets[index])) this.server_delete_bullet(index);
				
			}
		
	},
	
	server_bullet_check_hit: function (bullet) {
		for (var id in this.players) {
			if (id != bullet.owner_id)
				if (dis(bullet.pos, this.players[id].pos) < bullet.size + this.players[id].size) {
					this.players[id].health.cur -= bullet.damage;
					if (this.players[id].health.cur <= 0) {
						this.server_remove_player(id);
						this.trigger('player_gameover', {pid: id, kid: bullet.owner_id});
					}
					return true;
				}
		}
		return false;
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