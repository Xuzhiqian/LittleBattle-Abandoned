require("./core.js");
var extend = require("extend");
var power2 = function (a) {
	return a * a;
};
var dis = function (a, b) {
	return Math.sqrt(power2(a.x - b.x) + power2(a.y - b.y));
};

var isEmpty = function(a) {
	for (var prop in a)
		return false;
	return true;
};

var lerp = function(a,b,k) {
	if (k>1) return b;
	return a+(b-a)*k;
}

var diff = function (x, y) {

	var d = {};

	if (x === y) return d;
	for (var p in y) {
		
		if (y.hasOwnProperty(p)) {

			if (!x.hasOwnProperty(p)) {
				d[p]={};
				if (Q.isObject(p))
					extend(true,d[p],y[p]);
				else
					d[p]=y[p];
				continue;
			}
			
			if (x[p] === y[p]) continue;
			
			if (Q.isString(x[p]) || Q.isString(y[p]))
				if (x[p] !== y[p])
					d[p]=y[p];
				else continue;
			
			if (Q.isNumber(x[p]))
				if ((p=='x' || p=='y') && Math.abs(x[p] - y[p]) < 0.2)
					continue;
				else
					d[p]=y[p];

			if (Q.isBoolean(x[p]))
				if (x[p]===y[p])
					continue;
				else
					d[p]=y[p];
			
			if (Q.isObject(x[p]) && Q.isObject(y[p])) {
				d[p]={};
				extend(true,d[p],diff(x[p],y[p]));
				if (isEmpty(d[p])===true)
					delete d[p];				
			}			
		}
	}
	return d;
};

var rewards = ['heal','heal','maxhealth','faster','accer','accer','lucky','invisible','shield','shield','radar'];

Q.server_core = Q.core.extend({
	init: function () {
		this.player_count = 0;
		this.players = [];
		this.memory = '{}';
		this.memory_blue = '{}';
		this.lucks = [];
		this.bullets = [];
		this.boxes = [];
		this.weapons = [];
		this.anim_list = [];
		this.terrain = [];
		this.inputs = [];
		this.seqs = [];
		this.active = false;
		this.periods = 7;
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
			this.genbox={cur:0,max:240};


			this.genwpn={cur:0,max:720};
			this.weapons = [];
			this.boxes = [];
			this.bullets = [];
			this.server_generate_terrain();
			this.server_generate_blue();
		}

		//防止出生地落在地形上
		while (this.check_terrain(p.pos)===true)
			p.pos = this.server_random_pos();

	},

	server_random_pos : function() {
		return {
			x: Math.floor(Math.random() * this.global_width),
			y: Math.floor(Math.random() * this.global_height)
		};
	},

	server_generate_blue : function() {
		this.blue={
			ctrs:[],
		};
		do {
			last = this.server_random_pos();
		}while (this.check_terrain(last)===true);

		var r0 = Math.floor(dis({x:this.global_width,y:this.global_height},{x:0,y:0}))/3;
		for (var i=this.periods;i>=1;i--) {
			var r = Math.floor(r0/(Math.exp((i-1)*Math.log(1.8))));
			var d = Math.random()*r;
			var a = Math.random()*2*Math.PI;
			this.blue.ctrs.unshift({
				x:Math.min(Math.max(r,last.x+d*Math.cos(a)),this.global_width-r),
				y:Math.min(Math.max(r,last.y+d*Math.sin(a)),this.global_height-r),
				r:r
			});
			last = this.blue.ctrs[0];

		}
		this.blue.ctrs.unshift({
			x:this.global_width/2,
			y:this.global_height/2,
			r:this.global_width*2
		});

		this.blue.ctr = {
			x:this.blue.ctrs[0].x,
			y:this.blue.ctrs[0].y,
			r:this.blue.ctrs[0].r
		};
		this.blue.state = 'hold';
		this.blue.timer = 0;
	},

	server_update_blue : function(dt) {	//TODO
		if (this.blue.state === 'hold') {
			this.blue.timer += dt;
			if (this.blue.timer > 60) {
				if (this.blue.ctrs.length <= 1)
					this.blue.state = 'end';
				else
					this.blue.state = 'narrow';
				this.blue.timer = 0;
			}
		}
		else if (this.blue.state === 'narrow') {
			this.blue.timer += dt;
			var k = this.blue.timer / 30;
			this.blue.ctr = {
				x:lerp(this.blue.ctrs[0].x,this.blue.ctrs[1].x,k),
				y:lerp(this.blue.ctrs[0].y,this.blue.ctrs[1].y,k),
				r:lerp(this.blue.ctrs[0].r,this.blue.ctrs[1].r,k)
			};
			if (k > 1) {
				k = 1;
				this.blue.ctrs.shift();
				this.blue.state = 'hold';
				this.blue.timer = 0;
			}
		}
		else if (this.blue.state === 'end') {
				var h = -1;
				var winner ='';
				for (var id in this.players)
					if (this.players[id].health.cur>h) {
						h = this.players[id].health.cur;
						winner = id;
					}
				if (winner === '') return;
				for (var id in this.players)
					if (id!==winner) {
						this.trigger('player_gameover',{pkid:{pid:id,kid:winner},final:true});
						this.server_remove_player(id);
					}
				this.trigger('player_win',winner);
				this.server_remove_player(winner);
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
    	var isle={p:0.397 , w:1, s:5  , d:20};

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
		var pos = this.server_random_pos();
		if (this.check_terrain(pos)==true) return;
			
		var new_box = new Q.box(pos);
		var index = this.boxes.push(new_box) - 1;
		this.trigger('new_box', {box:new_box, index:index});
	},
	server_generate_weapon: function(_id,_pos,_ammo) {
		if (_ammo!=undefined && _ammo<=0) return;
		var pos = _pos || this.server_random_pos();
		if (this.check_terrain(pos)==true) return;

		var new_wpn = new Q.weapon(pos,_id || weapons[Math.floor(Math.random()*weapons.length)]);
		new_wpn.ammo = _ammo || Q.weapon_ammo[new_wpn.id];
		var index = this.weapons.push(new_wpn) - 1;
		this.trigger('new_weapon',{weapon:new_wpn, index:index});
	},

	server_new_bullet: function (player) {
		var new_bullet = new Q.bullet(player);
		var index = this.bullets.push(new_bullet) - 1;
		this.trigger('new_bullet', {bullet: new_bullet, index: index});
	},

	server_new_childbullet: function (player,_pos,_prop) {
		var org_prop = player.prop;
		var org_pos = player.pos;
		player.pos = _pos;
		player.prop = {}; extend(true,player.prop,_prop);
		player.prop.bias = 2;
		var bundle = (_prop.bundle!==undefined)?_prop.bundle:10;
		for (var i=0;i<bundle;i++)
			this.server_new_bullet(player);
		player.prop = org_prop;
		player.pos = org_pos;
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
			this.genbox.max+=10;
		}
		this.genwpn.cur+=1;
		if (this.genwpn.cur>=this.genwpn.max) {
			this.server_generate_weapon();
			this.genwpn.cur=0;
			this.genwpn.max+=10;
		}

		this.server_update_blue(dt);
		this.server_update_players(dt);
		this.server_update_bullets(dt);
		this.server_update_boxes(dt);

	},
	
	server_update_players: function(dt) {
		for (var id in this.players) 
			if (this.players[id]!=null) {

			if (this.inputs[id] != undefined) {
				for (var unit_index in this.inputs[id]) {
					var msg = this.inputs[id][unit_index];
					this.process_inputs(this.players[id], msg.input, 0.016689);
					if (msg.input.kb.indexOf('j') !== -1)
						this.server_player_shoot(id);
					if (msg.input.kb.indexOf('f') !== -1)
						this.server_player_use(id);
					this.seqs[id] = msg.seq;
				}
				this.inputs[id] = [];
				
			}

			if (this.players[id]!=undefined && this.players[id].prop.seek===true) {
				this.players[id].prop.target = '#';
				for (var _id in this.players)
					if (_id!==id) {
						this.players[id].prop.target = _id;
						break;
					}
			}

			if (dis(this.players[id].pos,this.blue.ctr)>this.blue.ctr.r)
				this.server_cause_damage_to_player('#blue',id,1/30);
		}
	},

	server_update_bullets: function(dt) {
		for (var index in this.bullets)
			if (!!this.bullets[index]) {
				var b = this.bullets[index];
				this.update_bullet_physics(b,dt);
				this.server_bullet_check_hit(index);
				if (b.seek===true && this.players[b.owner_id]!=undefined && this.players[b.owner_id].prop.target!=undefined)
					this.bullet_seek(b,this.players[this.players[b.owner_id].prop.target]);

				if (b.destroyable===true) {
					if (!(b.hittofade===false))
						this.server_delete_bullet(index);
					else
						b.destroyable = false;
				}
				if (b.timeout===true){
					if (b.delayedaction===true && this.players[b.owner_id]!=undefined)
						this.server_new_childbullet(this.players[b.owner_id],b.pos,Q.weapon_data[b.child]);
					this.server_delete_bullet(index);
				}
			}
	},

	server_update_boxes: function(dt) {
		for (var index in this.boxes)
			if (!!this.boxes[index]) {
				var b = this.boxes[index];
				b.update(dt);
				if (b.destroyable===true) this.server_delete_box(index);
			}
	},
	
	server_player_use: function (pid) {
		var p = this.players[pid];
		if (p==undefined) return;

		if (p.isArmed()===true)
		{
			this.server_generate_weapon(p.weapon,p.pos,p.ammo);
			this.players[pid].unequip();
			return;
		}
		for (var index in this.weapons) {
			var w = this.weapons[index];
			if (!!w)
				if (dis(p.pos,w.pos)<p.size+35) {
					this.players[pid].equip(w);
					this.server_delete_weapon(index);
					this.trigger('player_alert',{id:pid,type:'reward'});
					break;
				}
		}
	},

	server_player_shoot: function (pid) {
		var p = this.players[pid];
		if (p.isArmed()) {
			if (p.weapon==='Pan') {
				
				p.reflect = true;
				setTimeout(()=>{p.reflect=false},850);
				for (var id in this.players) {
					var q = this.players[id];
					if (id !== pid)
						if (dis(p.pos,q.pos)<5*p.size)
							this.server_cause_damage_to_player(pid,id,p.prop.damage);
				}
				for (var index in this.boxes) {
					var b = this.boxes[index];
					if (dis(p.pos,b.pos)<5*p.size) {
						this.server_cause_damage_to_box(pid,index,p.prop.damage);
						this.trigger('box_underattack',{index:index,cur:b.health.cur});
					}
				}
				return;
			}

			if (p.ammo>0)
				this.players[pid].ammo-=1;
			else 
				this.players[pid].unequip();
		}
		for (var i=0;i<(p.prop.bundle || 1);i++)
			this.server_new_bullet(this.players[pid]);
	},

	server_bullet_check_hit: function (bindex) {
		var bullet = this.bullets[bindex];
		for (var id in this.players) {
			var p = this.players[id];
			if (id != bullet.owner_id)
				if (dis(bullet.pos, p.pos) < bullet.size + p.size) {

					if (p.reflect===true) {

							var a = Math.atan(bullet.dir.y / bullet.dir.x);
							if (bullet.dir.x<0) a=a+Math.PI;
							var r = Math.atan((bullet.pos.y - p.pos.y)/(bullet.pos.x - p.pos.x));
							if (bullet.pos.x<p.pos.x) r=r+Math.PI;

							var new_dir = 2*r+Math.PI - a;
							bullet.dir = {x:Math.cos(new_dir),y:Math.sin(new_dir)};
							bullet.owner_id = id;
							if (this.players[id]!=undefined)
								this.players[id].prop.seek = bullet.seek;
							bullet.color = p.color;
							this.trigger('new_bullet',{bullet:bullet,index:bindex});
							continue;

					}

					this.server_cause_damage_to_player(bullet.owner_id,id,bullet.damage);
					bullet.destroyable = true;
					break;
				}
		}

		if (bullet.destroyable === true) return;

		for (var index in this.boxes) {
			var b = this.boxes[index];
			if (dis(bullet.pos, b.pos) < bullet.size + b.size) {
				this.server_cause_damage_to_box(bullet.owner_id,index,bullet.damage);
				bullet.destroyable = true;
				break;
			}
		}
	},

	server_cause_damage_to_player: function (oid,pid,dmg) {
		if (dmg===0) return;
		var p = this.players[pid];
		p.invisible = false;
		p.health.cur += Math.min(p.shield-dmg,0);
		p.shield = Math.max(p.shield-dmg,0);
		if (p.health.cur <= 0) {
			this.server_remove_player(pid);
			this.trigger('player_gameover', {pkid:{pid: pid, kid: oid}});
		}
		else {
			if (oid!=='#blue')
				this.trigger('player_alert',{id:oid,type:'attack'});
		}
	},

	server_cause_damage_to_box: function (oid,bindex,dmg) {
		if (dmg<=0) return;
		var b = this.boxes[bindex];
		b.health.cur -= dmg;
		if (b.health.cur <= 0) {
			this.server_player_reward(oid,b);
			b.destroyable = true;
		}
		this.trigger('box_underattack',{index:bindex,cur:b.health.cur});
	},

	server_player_premium_reward: function(pid,box) {
		var prewpn = premium[Math.floor(Math.random()*premium.length)];
		this.server_generate_weapon(prewpn,box.pos);
	},

	server_player_reward: function(pid, box) {
		if (!this.players[pid]) return;
		if (box.premium===true) {
			this.server_player_premium_reward(pid,box);
			return;
		}
		var p = this.players[pid];

		var isrd = this.lucks[pid] || 0.5;
		if (Math.random()>isrd) return;

		var c = Math.floor(rewards.length*Math.random());
		
		switch (rewards[c]) {
			case 'heal':
				p.health.cur = p.health.max;
				break;

			case 'maxhealth':
				p.health.max = Math.min(p.health.max+10,150);
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
					this.lucks[pid] = 0.55;
				else
					this.lucks[pid] = Math.min(this.lucks[pid]+0.05,0.7);
				break;

			case 'invisible':
				p.invisible = true;
				setTimeout((function(){p.invisible=false;}).bind(this),30000);
				break;

			case 'shield':
				p.shield += 60;
				setTimeout((function(){p.shield=Math.max(p.shield-60,0);}).bind(this),30000);
				break;

			case 'radar':
				p.radar = true;
				setTimeout((function(){p.radar=false;}).bind(this),30000);
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
			players:{},
			seqs: [],
			blue:{}
		};
		var now=[];
		var old = JSON.parse(this.memory);
		for (var index in old)
			delete old[index].id;

		for (var id in this.players) {
			now.push(this.players[id]);
			if (this.seqs[id] != undefined)
				state.seqs.push({seq: this.seqs[id], id: id});
			else
				state.seqs.push({seq: -1, id: id});
		}
		this.seqs = [];
		state.players = diff(old,now);
		this.memory = JSON.stringify(now);

		for (var index in state.players) {
			var is_silence = true;
			for (var prop in state.players[index])
				if (prop!=='id') {
					is_silence = false;
					break;
				}
			if (is_silence)
				delete state.players[index];
		}

		var new_blue = this.blue.ctr;
		var old_blue = JSON.parse(this.memory_blue);
		state.blue = diff(old_blue,new_blue);
		if (isEmpty(state.blue)===true)
			delete state.blue;
		this.memory_blue = JSON.stringify(new_blue);

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

var weapons = ['UMP9','UMP9',
			   'Micro_Uzi','Micro_Uzi',
			   'Vector','Vector',
			   'AKM','AKM',
			   'Groza',
			   'M16A4','M16A4',
			   'Scar-L','Scar-L',
			   'M416','M416',
			   'Kar-98K',
			   'SKS','SKS',
			   'M24',
			   'MK14','MK14',
			   'M249','M249',
			   'S1897','S1897',
			   'S686',
			   'Minigun',
			   'PF-89',
			   'Pan','Pan',
			   'Grenade','Grenade'];
var premium = ['AWM','Dominator-77','DeathGrenade','Seeker'];
