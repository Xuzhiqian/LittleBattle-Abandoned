require("./core.js");

var power2 = function (a) {
	return a * a;
};
var dis = function (a, b) {
	return Math.sqrt(power2(a.x - b.x) + power2(a.y - b.y));
};

var rewards = ['heal','heal','maxhealth','faster','accer','accer','lucky','invisible','shield','shield','radar'];

Q.server_core = Q.core.extend({
	init: function () {
		this.player_count = 0;
		this.players = [];
		this.lucks = [];
		this.bullets = [];
		this.boxes = [];
		this.weapons = [];
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
			this.genwpn={cur:0,max:100};
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

	server_generate_weapon: function() {
		var pos = {
				x: Math.floor(Math.random() * this.global_width),
				y: Math.floor(Math.random() * this.global_height)
			};
		if (this.check_terrain(pos)==true) return;

		var new_wpn = new Q.weapon(pos,weapons[Math.floor(Math.random()*weapons.length)]);
		new_wpn.ammo = Q.weapon_ammo[new_wpn.id];
		var index = this.weapons.push(new_wpn) - 1;
		this.trigger('new_weapon',{weapon:new_wpn, index:index});
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

	server_delete_weapon: function (index) {
		delete this.weapons[index];
		this.trigger('delete_weapon',index);
	},
	
	server_update: function (dt) {
		if (!this.active) return;

		this.genbox.cur+=1;
		if (this.genbox.cur>=this.genbox.max) {
			this.server_generate_box();
			this.genbox.cur=0;
			this.genbox.max+=1;
		}

		this.genwpn.cur+=1;
		if (this.genwpn.cur>=this.genwpn.max) {
			this.server_generate_weapon();
			this.genwpn.cur=0;
			this.genwpn.max+=1;
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
					
					this.process_inputs(this.players[id], msg.input, msg.dt);
					if (msg.input.kb.indexOf('j') !== -1) {
						if (this.players[id].isArmed()) {
							if (this.players[id].ammo>0)
								this.players[id].ammo-=1;
							else 
								this.players[id].unequip();
						}
						this.server_new_bullet(this.players[id]);
					}
					if (msg.input.kb.indexOf('f') !== -1)
						this.server_player_use(id);
					
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

	server_player_use: function (pid) {
		for (var index in this.weapons) {
			var w = this.weapons[index];
			if (w!=null)
				if (dis(this.players[pid].pos,w.pos)<this.players[pid].size+25) {
					this.players[pid].equip(w);
					this.server_delete_weapon(index);
					break;
				}
		}
	},

	server_bullet_check_hit: function (bullet) {
		for (var id in this.players) {
			var p = this.players[id];
			if (id != bullet.owner_id)
				if (dis(bullet.pos, p.pos) < bullet.size + p.size) { 

					p.invisible = false;
					p.health.cur += Math.min(p.shield-bullet.damage,0);
					p.shield = Math.max(p.shield-bullet.damage,0);

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
		if (!this.players[pid]) return;
		var p = this.players[pid];

		p.score+=box.health.max/10;

		/*
		var isrd = this.lucks[pid] || 0.2;
		if (Math.random()>isrd) return;
		*/
		

		var c = Math.floor(rewards.length*Math.random());
		
		switch (rewards[c]) {
			case 'heal':
				p.health.cur = Math.min(p.health.cur+10,p.health.max);
				break;

			case 'maxhealth':
				p.health.max = Math.min(p.health.max+5,150);
				break;

			case 'faster':
				p.speed.x.max = Math.min(p.speed.x.max + 10, 160);
				p.speed.y.max = Math.min(p.speed.y.max + 10, 160);
				break;

			case 'accer':
				p.speed.x.acc = Math.min(p.speed.x.acc + 20, 300);
				p.speed.y.acc = Math.min(p.speed.y.acc + 20, 300);
				break;

			case 'lucky':
				if (!this.lucks[pid])
					this.lucks[pid] = 0.25;
				else
					this.lucks[pid] = Math.min(this.lucks[pid]+0.05,0.5);
				break;

			case 'invisible':
				p.invisible = true;
				setTimeout((function(){p.invisible=false;}).bind(this),30000);
				break;

			case 'shield':
				p.shield += 30;
				setTimeout((function(){p.shield=Math.max(p.shield-30,0);}).bind(this),30000);
				break;

			case 'radar':
				p.radar = true;
				setTimeout((function(){p.radar=false;}).bind(this),10000);
				break;
		}
		this.trigger('player_reward',{id:pid,reward:rewards[c]});
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

var weapons = ['UMP9','UMP9','UMP9',
			   'Micro_Uzi','Micro_Uzi',
			   'Vector','Vector',
			   'AKM','AKM',
			   'Groza',
			   'M16A4','M16A4','M16A4',
			   'Scar-L','Scar-L',
			   'M416','M416',
			   'Kar-98K','Kar-98K',
			   'SKS','SKS',
			   'AWM',
			   'MK14','MK14',
			   'M249','M249',
			   'Minigun','Minigun',
			   'Dominator-77',
			   'PF-89'];
Q.weapon_data = [];
Q.weapon_ammo = [];

//冲锋枪
Q.weapon_data['UMP9']={
			speed : 270,
			reload : 0.3,
			bias : 0.08,
			life : 6,
			damage : 6,
			recoil : 2,
			sight : 1,
			penetrate : false,
			bounce : false
		};
Q.weapon_ammo['UMP9']=30;

Q.weapon_data['Micro_Uzi']={
			speed : 280,
			reload : 0.1,
			bias : 0.05,
			life : 7,
			damage : 2,
			recoil : 2,
			sight : 1,
			size : 2,
			penetrate : false,
			bounce : false
		};
Q.weapon_ammo['Micro_Uzi']=90;

Q.weapon_data['Vector']={
			speed : 290,
			reload : 0.2,
			bias : 0.08,
			life : 5,
			damage : 5,
			recoil : 1,
			sight : 1,
			size : 4,
			penetrate : false,
			bounce : false
		};
Q.weapon_ammo['Vector']=50;

//突击步枪
Q.weapon_data['AKM']={
			speed : 300,
			reload : 0.25,
			bias : 0.15,
			life : 8,
			damage : 15,
			recoil : 5,
			sight : 1,
			size : 6,
			penetrate : false,
			bounce : false
		};
Q.weapon_ammo['AKM']=30;

Q.weapon_data['Groza']={
			speed : 290,
			reload : 0.22,
			bias : 0.1,
			life : 8,
			damage : 10,
			recoil : 1,
			sight : 1.05,
			penetrate : false,
			bounce : false
		};
Q.weapon_ammo['Groza']=60;

Q.weapon_data['M16A4']={
			speed : 300,
			reload : 0.24,
			bias : 0.12,
			life : 7,
			damage : 8,
			recoil : 2,
			sight : 1,
			penetrate : false,
			bounce : false
		};
Q.weapon_ammo['M16A4']=30;

Q.weapon_data['Scar-L']={
			speed : 310,
			reload : 0.23,
			bias : 0.08,
			life : 6,
			damage : 7,
			recoil : 1.5,
			sight : 1,
			penetrate : false,
			bounce : false
		};
Q.weapon_ammo['Scar-L']=40;

Q.weapon_data['M416']={
			speed : 330,
			reload : 0.26,
			bias : 0.08,
			life : 6,
			damage : 10,
			recoil : 1.5,
			sight : 1,
			penetrate : false,
			bounce : false
		};
Q.weapon_ammo['M416']=40;

//狙击步枪
Q.weapon_data['Kar-98K']={
			speed : 600,
			reload : 1.2,
			bias : 0.04,
			life : 12,
			damage : 50,
			recoil : 12,
			sight : 1.1,
			size : 3,
			penetrate : true,
			bounce : false
		};
Q.weapon_ammo['Kar-98K']=15;

Q.weapon_data['SKS']={
			speed : 580,
			reload : 1,
			bias : 0.03,
			life : 13,
			damage : 45,
			recoil : 5,
			sight : 1.1,
			size : 3.5,
			penetrate : false,
			bounce : false
		};
Q.weapon_ammo['SKS']=15;

Q.weapon_data['AWM']={
			speed : 580,
			reload : 1.5,
			bias : 0.02,
			life : 13,
			damage : 100,
			recoil : 5,
			sight : 1.2,
			size : 2.5,
			penetrate : true,
			bounce : false
		};
Q.weapon_ammo['AWM']=10;

Q.weapon_data['MK14']={
			speed : 400,
			reload : 0.8,
			bias : 0.03,
			life : 12,
			damage : 50,
			recoil : 4,
			sight : 1.1,
			size : 3,
			penetrate : false,
			bounce : false
		};
Q.weapon_ammo['MK14']=15;

//轻机枪
Q.weapon_data['M249']={
			speed : 380,
			reload : 0.12,
			bias : 0.05,
			life : 12,
			damage : 10,
			recoil : 1,
			sight : 1,
			size : 4,
			penetrate : false,
			bounce : false
		};
Q.weapon_ammo['M249']=100;

Q.weapon_data['Minigun']={
			speed : 400,
			reload : 0.11,
			bias : 0.04,
			life : 10,
			damage : 8,
			recoil : 2,
			sight : 1,
			penetrate : false,
			bounce : false
		};
Q.weapon_ammo['Minigun']=100;

//重机枪
Q.weapon_data['Dominator-77']={
			speed : 420,
			reload : 0.12,
			bias : 0.1,
			life : 15,
			damage : 10,
			recoil : 0,
			sight : 1,
			size : 6,
			penetrate : true,
			bounce : false
		};
Q.weapon_ammo['Dominator-77']=80;

//火箭炮
Q.weapon_data['PF-89']={
			speed : 150,
			reload : 5,
			bias : 0.05,
			life : 30,
			damage : 120,
			recoil : 30,
			sight : 1.4,
			size : 12,
			penetrate : true,
			bounce : false
		};
Q.weapon_ammo['PF-89']=5;

