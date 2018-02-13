if ('undefined' != typeof global) {
	var Quisus = require('./quisus.js');
}

var Q = Quisus();

var global_width = 2400,
	global_height = 2400;

var v_a=function (a, b) {
		return {x: a.x + b.x, y: a.y + b.y}
	},
	v_n=function (a, b) {
		return {x: a.x * b, y: a.y * b}
	},
	v_normal=function (a) {
		var s = Math.sqrt(power2(a.x)+power2(a.y));
		return {x:a.x/s,y:a.y/s};
	}
	power2 = function (a) {
		return a * a;
	},
	dis = function (a, b) {
		return Math.sqrt(power2(a.x - b.x) + power2(a.y - b.y));
	};
Q.fix = function(x) {
	return parseFloat(x.toFixed(6));
};

Q.isNumber = function (x) {
		return (typeof x === 'number');
};
Q.isString = function (x) {
		return (typeof x === 'string');
};
Q.isObject = function (x) {
		return (typeof x === 'object');
};
Q.isBoolean = function (x) {
		return (typeof x === 'boolean');
}

var player_size = 15;
var bullet_size = 5;
var prop_org = {
	speed : 240,
	reload : 0.6,
	bias : 0.1,
	life : 5,
	damage : 10,
	bounce : false,
	recoil : 0,
	sight : 1,
	size : bullet_size,
	penetrate : false
};

Q.game_player = function(alias) {
	this.id = alias;
	this.pos = {
		x: Math.floor(Math.random() * global_width),
		y: Math.floor(Math.random() * global_height)
	};
	this.health = {cur: 100, max: 100};
	this.shield = 0;
	this.speed = {x: {cur: 0, max: 120, acc: 180}, y: {cur: 0, max: 120, acc: 180}};
	this.dir = 0;
	this.color = 0;
	this.size = player_size;
	this.prop=prop_org;

	this.alpha = 1;
	this.invisible = false;
	this.radar = false;
	this.reflect = false;
};

Q.game_player.prototype.isArmed = function() {
	return (typeof this.weapon === 'string' && this.weapon.length>0);
};

Q.game_player.prototype.equip = function(weapon) {
		this.weapon = weapon.id;
		this.ammo = weapon.ammo;
		this.prop = Q.weapon_data[weapon.id];
};

Q.game_player.prototype.unequip = function() {
	this.weapon = '';
	this.ammo = 0;
	this.prop = prop_org;
}

Q.bullet = function (p) {
	//基础属性
	this.pos = {x: p.pos.x, y: p.pos.y};
	this.size = p.prop.size || bullet_size;
	this.color = p.color;
	this.owner_id = p.id;
	this.destroyable = false;
	this.alpha = 1;

	//可增强属性
	this.speed = p.prop.speed;
	this.life = {cur: 0, max: p.prop.life};
	this.bounce = p.prop.bounce;
	this.damage = p.prop.damage;
	this.penetrate = p.prop.penetrate;
	if (p.prop.hittofade!=undefined)
		this.hittofade = p.prop.hittofade;
	if (p.prop.delayedaction!=undefined) {
		this.delayedaction = p.prop.delayedaction;
		this.child = p.prop.child || 'Grenade_child';
	}
	if (p.prop.seek != undefined)
		this.seek = p.prop.seek;

	//弹道偏移
	var b = p.prop.bias;
	var start_dir = p.dir + Math.PI / 2 * (Math.random() * 2 * b - b);
	this.dir = {x: Q.fix(Math.cos(start_dir)), y: Q.fix(Math.sin(start_dir))};
};

Q.box = function (pos) {
	this.pos = {x:pos.x, y:pos.y};
	this.premium = Math.random()<0.2?true:false;
	var maxhp = Math.floor(Math.random()*8+2)*(this.premium===true?20:10);		//血量随机
	this.health = {cur:maxhp, max:maxhp};
	this.destroyable = false;
	this.alpha = 1;
	this.size = this.premium===true?18:12;
	this.life = {cur:0,max:this.premium===true?300:80};
};

Q.box.prototype.update = function(dt) {
	this.life.cur += dt;
	if (this.life.cur>this.life.max)
		this.destroyable = true;
};

Q.weapon = function (pos,id) {
	this.pos = {x:pos.x,y:pos.y};
	this.id = id;
};

Q.core = Q.Evented.extend({
	global_width:global_width,
	global_height:global_height,

	block_width:20,
	block_height:20,

	tickrate:60,		//客户端和服务器的通信间隔(ms)

	move_u: function (p, dt) {
		p.speed.y.cur = Math.max(p.speed.y.cur - dt * p.speed.y.acc, -p.speed.y.max);
	},
	move_d: function (p, dt) {
		p.speed.y.cur = Math.min(p.speed.y.cur + dt * p.speed.y.acc, p.speed.y.max);
	},
	move_l: function (p, dt) {
		p.speed.x.cur = Math.max(p.speed.x.cur - dt * p.speed.x.acc, -p.speed.x.max);
	},
	move_r: function (p, dt) {
		p.speed.x.cur = Math.min(p.speed.x.cur + dt * p.speed.x.acc, p.speed.x.max);
	},
	
	update_player_physics: function (p, dt, is_no_x, is_no_y, is_no_j) {
		
		//后坐力
		if (!is_no_j) {
			p.speed.x.cur -= Math.cos(p.dir) * p.prop.recoil * 20;
			p.speed.y.cur -= Math.sin(p.dir) * p.prop.recoil * 20;
			p.speed.x.cur = Math.max(Math.min(p.speed.x.cur,p.speed.x.max),-p.speed.x.max);
			p.speed.y.cur = Math.max(Math.min(p.speed.y.cur,p.speed.y.max),-p.speed.y.max);
		}
		else {
			//粘滞阻力
			if (is_no_x) {
			if (p.speed.x.cur > 0)
				p.speed.x.cur = Math.max(0, p.speed.x.cur - dt * p.speed.x.acc);
			else
				p.speed.x.cur = Math.min(0, p.speed.x.cur + dt * p.speed.x.acc);
			}
			if (is_no_y) {
			if (p.speed.y.cur > 0)
				p.speed.y.cur = Math.max(0, p.speed.y.cur - dt * p.speed.y.acc);
			else
				p.speed.y.cur = Math.min(0, p.speed.y.cur + dt * p.speed.y.acc);
			}
		}

		//地形碰撞检测
		check=[[p.speed.x.cur>0?1:-1,0],[0,p.speed.y.cur>0?1:-1]];
		speed = p.speed.x.cur*p.speed.x.cur+p.speed.y.cur*p.speed.y.cur;
		check.push([p.speed.x.cur/speed,p.speed.y.cur/speed]);

		for (var i=0;i<3;i++) {
			block_x = Math.floor((p.pos.x+check[i][0]*p.size) / this.block_width);
			block_y = Math.floor((p.pos.y+check[i][1]*p.size) / this.block_height);
			if (this.terrain[block_x]!=undefined)
			if (this.terrain[block_x][block_y]!=undefined)
			if (this.terrain[block_x][block_y]==1) {
				if (Math.abs(check[i][0])>0.01) p.speed.x.cur = 0;
				if (Math.abs(check[i][1])>0.01) p.speed.y.cur = 0;
			}
		}

		p.pos.x = p.pos.x + p.speed.x.cur * dt;
		p.pos.y = p.pos.y + p.speed.y.cur * dt;

		//越界检测
		if (p.pos.x < 0) p.pos.x = 0;
		if (p.pos.y < 0) p.pos.y = 0;
		if (p.pos.x > this.global_width) p.pos.x = this.global_width;
		if (p.pos.y > this.global_height) p.pos.y = this.global_height;
	},
	
	update_bullet_physics:function (b,dt) {
		b.pos = v_a(b.pos, v_n(b.dir, dt * b.speed));

		if (b.pos.x < 0 || b.pos.x > this.global_width)
			if (b.bounce==true)
				b.dir.x = -b.dir.x;
			else
				b.destroyable = true;
		if (b.pos.y < 0 || b.pos.y > this.global_height)
			if (b.bounce==true)
				b.dir.y = -b.dir.y;
			else
				b.destroyable = true;

		//地形反弹
		if (!b.penetrate) {
		b_check=[[b.dir.x>0?1:-1,0],[0,b.dir.y>0?1:-1]];
		for (var i=0;i<2;i++) {
			bblck_x = Math.floor((b.pos.x+b_check[i][0]*b.size) / this.block_width);
			bblck_y = Math.floor((b.pos.y+b_check[i][1]*b.size) / this.block_height);
			if (this.terrain[bblck_x]!=undefined)
				if (this.terrain[bblck_x][bblck_y]!=undefined)
					if (this.terrain[bblck_x][bblck_y]==1) {
						if (b.bounce==true) {
							if (i==0) b.dir.x = -b.dir.x;
							if (i==1) b.dir.y = -b.dir.y;
						}
						else {
							b.destroyable=true;
							break;
						}
					}
		}
		}

		b.life.cur += dt;
		if (b.life.cur>b.life.max) b.timeout=true;

	},

	bullet_seek : function(bullet,target) {
		if (target==undefined) return false;
		var d = dis(bullet.pos,target.pos);
		var b= {x:(target.pos.x-bullet.pos.x)/d/8,y:(target.pos.y-bullet.pos.y)/d/8};
		bullet.dir=v_normal(v_a(b,bullet.dir));
		return true;
	},

	process_inputs: function (p, inputs, dt) {

		for (var i = 0; i < inputs.kb.length; i++) {
			switch (inputs.kb[i]) {
				case 'w':
					this.move_u(p, dt);
					break;
				case 's':
					this.move_d(p, dt);
					break;
				case 'a':
					this.move_l(p, dt);
					break;
				case 'd':
					this.move_r(p, dt);
					break;
			}
		}
		this.update_player_physics(p, dt, (inputs.kb.indexOf('a') < 0 && inputs.kb.indexOf('d') < 0),
			(inputs.kb.indexOf('w') < 0 && inputs.kb.indexOf('s') < 0), inputs.kb.indexOf('j') < 0);
		
		if (inputs.ms!=undefined)
			p.dir = inputs.ms;
	},

	compressInput : function(msg) {
		var c = '';
		if (msg.input.kb.indexOf('j')>=0)
			c = c +msg.seq+','+msg.input.kb+','+msg.input.ms;
		else
			c = c+ msg.seq+','+msg.input.kb+',';
		return c;
		console.log(c);
	},

	decompressInput : function(c) {
		var para = c.split(',');
		var msg = {
			seq:parseInt(para[0]),
			input:{
				kb:para[1]
			}
		};
		if (para[2]!=='')
			msg.input.ms = parseFloat(para[2]);
		return msg;
	},

	check_terrain: function(pos) {
		var bx = Math.floor(pos.x/this.block_width);
		var by = Math.floor(pos.y/this.block_height);
		if (this.terrain[bx]!==undefined)
			if (this.terrain[bx][by]!==undefined)
				return this.terrain[bx][by]===1;
		return true;
	}
});

Q.weapon_data = [];
Q.weapon_ammo = [];
Q.child_bullet = ['Groza','Micro_Uzi','Kar-98K','PF89','MK14',];

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
			damage : 4,
			recoil : 1,
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
			life : 6,
			damage : 6,
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
			damage : 25,
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
			damage : 15,
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
			damage : 14,
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
			damage : 12,
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

Q.weapon_data['M24']={
			speed : 580,
			reload : 3,
			bias : 0,
			life : 12,
			damage : 90,
			recoil : 25,
			sight : 1.4,
			size : 2,
			penetrate : true,
			bounce : false
		};
Q.weapon_ammo['M24']=5;

Q.weapon_data['AWM']={
			speed : 600,
			reload : 2.5,
			bias : 0.01,
			life : 13,
			damage : 80,
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

//霰弹枪
Q.weapon_data['S1897']={
			speed : 600,
			reload : 0.8,
			bias : 0.2,
			life : 4,
			damage : 15,
			recoil : 45,
			sight : 1,
			size : 4,
			penetrate : false,
			bounce : false,
			bundle : 5
		};
Q.weapon_ammo['S1897']=10;

Q.weapon_data['S686']={
			speed : 620,
			reload : 2,
			bias : 0.3,
			life : 3,
			damage : 32,
			recoil : 50,
			sight : 1,
			size : 5,
			penetrate : false,
			bounce : false,
			bundle : 6
		};
Q.weapon_ammo['S686']=8;

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
			sight : 1.5,
			size : 5,
			penetrate : true,
			bounce : false
		};
Q.weapon_ammo['Dominator-77']=100;

//火箭炮
Q.weapon_data['PF-89']={
			speed : 150,
			reload : 3,
			bias : 0.05,
			life : 60,
			damage : 2,
			recoil : 50,
			sight : 1.4,
			size : 12,
			penetrate : false,
			bounce : true,
			hittofade : false
		};
Q.weapon_ammo['PF-89']=5;

Q.weapon_data['Pan']={
			reload : 1,
			damage : 35,
			recoil : 0,
			sight : 1
		};
Q.weapon_ammo['Pan']=0;

Q.weapon_data['Grenade']={
			reload : 2.5,
			speed : 250,
			bias : 0,
			life : 3,
			damage : 0,
			recoil : 0,
			sight : 1,
			size : 1,
			penetrate : false,
			bounce : true,
			delayedaction : true,
			hittofade : false,
			child : 'Grenade_child'
		};
Q.weapon_ammo['Grenade']=3;

Q.weapon_data['Grenade_child']={
			speed : 400,
			bias : 2,
			life : 5,
			damage : 20,
			size : 5,
			penetrate : false,
			bundle : 10,
			bounce : true
		};
Q.weapon_data['DeathGrenade']={
			reload : 2.5,
			speed : 250,
			bias : 0,
			life : 3,
			damage : 0,
			recoil : 0,
			sight : 1.2,
			size : 1,
			penetrate : false,
			bounce : true,
			delayedaction : true,
			hittofade : false,
			child : 'Grenade'
		};
Q.weapon_ammo['DeathGrenade']=2;

Q.weapon_data['Seeker']={
			reload : 3,
			speed : 380,
			bias : 0,
			life : 45,
			damage : 50,
			recoil : 40,
			sight : 1.2,
			size : 6,
			penetrate : false,
			bounce : false,
			seek : true
		};
Q.weapon_ammo['Seeker']=5;

if ('undefined' != typeof global)
	module.exports = global.Q = Q;
