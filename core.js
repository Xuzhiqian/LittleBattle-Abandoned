if ('undefined' != typeof global) {
	var Quisus = require('./quisus.js');
}

var Q = Quisus();

var global_width = 2400,
	global_height = 1800;

var v_a=function (a, b) {
		return {x: a.x + b.x, y: a.y + b.y}
	},
	v_n=function (a, b) {
		return {x: a.x * b, y: a.y * b}
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

	this.score = 0;
	this.alpha = 1;
	this.invisible = false;
	this.radar = false;
};

Q.game_player.prototype.isArmed = function() {
	return (typeof this.weapon === 'string' && this.weapon.length>0);
};

Q.game_player.prototype.equip = function(weapon) {
	if (this.isArmed()) {
		if (this.weapon==weapon.id)
			this.ammo += weapon.ammo;
		else {
			this.unequip();
			this.equip(weapon);
		}
	}
	else {
		this.weapon = weapon.id;
		this.ammo = weapon.ammo;
		this.prop = Q.weapon_data[weapon.id];
	}
};

Q.game_player.prototype.unequip = function() {
	delete this.weapon;
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

	//弹道偏移
	var b = p.prop.bias;
	var start_dir = p.dir + Math.PI / 2 * (Math.random() * 2 * b - b);
	this.dir = {x: Math.cos(start_dir), y: Math.sin(start_dir)};
};

Q.box = function (pos) {
	this.pos = {x:pos.x, y:pos.y};
	var maxhp = Math.floor(Math.random()*10+1)*10;		//血量随机
	this.health = {cur:maxhp, max:maxhp};
	this.life = {cur:0, max:60};
	this.size = 12;
	this.destroyable = false;
	this.alpha = 1;
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
		if (b.life.cur>b.life.max) b.destroyable=true;

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

	encodeInput : function(msg) {
		var v = 0;
		var input = msg.input.kb;
		if (input.indexOf('w')!=-1) v=(v+1)%3;
		if (input.indexOf('s')!=-1) v=(v+2)%3;

		var h = 0;
		if (input.indexOf('a')!=-1) h=(h+1)%3;
		if (input.indexOf('d')!=-1) h=(h+2)%3;

		var d = v + h * 3;
		if (input.indexOf('f')!=-1) d=d+9;
		if (input.indexOf('j')!=-1) d=d+18;
		if (d<10) msg.input.kb=String.fromCharCode(48+d);
		else msg.input.kb=String.fromCharCode(55+d);
	},

	compressInput : function(msg) {
		var c = '';
		if (msg.input.kb>='I')
			c = c +msg.seq+','+msg.input.kb+','+msg.input.ms;
		else
			c = c+ msg.seq+','+msg.input.kb+',';
		return c;
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

	decodeInput : function(msg) {
		var input = msg.input.kb.charCodeAt(0);
		var org = '';

		if (48<=input && input<=57)
			input = input - 48;
		else
			input = input - 55;

		if (input>=18) {
			org=org+'j';
			input %= 18;
		}
		if (input>=9) {
			org=org+'f';
			input %= 9;
		}
		var h = Math.floor(input / 3);
		var v = input % 3;
		if (h==1) org=org+'a';
		if (h==2) org=org+'d';
		if (v==1) org=org+'w';
		if (v==2) org=org+'s';
		msg.input.kb = org;
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

if ('undefined' != typeof global)
	module.exports = global.Q = Q;
