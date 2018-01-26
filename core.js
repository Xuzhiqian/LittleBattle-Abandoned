if ('undefined' != typeof global) {
	var Quisus = require('./quisus.js');
}

var Q = Quisus();

var global_width = 3200,
	global_height = 2400;

var v_a=function (a, b) {
		return {x: a.x + b.x, y: a.y + b.y}
	},
	v_n=function (a, b) {
		return {x: a.x * b, y: a.y * b}
	};

var player_cmp = function (x, y) {
	var isNumber = function (x) {
		return (typeof x === 'number');
	};
	var isString = function (x) {
		return (typeof x === 'string');
	};
	var isObject = function (x) {
		return (typeof x === 'object');
	};
	
	if (x === y) return true;
	for (var p in x) {
		
		if (x.hasOwnProperty(p)) {
			if (!y.hasOwnProperty(p)) {
				return false;
			}
			
			if (x[p] === y[p]) continue;
			
			if (isString(x[p]) || isString(y[p]))
				if (x[p] !== y[p]) return false;
				else continue;
			
			if ((isNumber(x[p]) && !isNumber(y[p])) || (!isNumber(x[p]) && isNumber(y[p])))
				return false;
			else if (isNumber(x[p]))
				if (Math.abs(x[p] - y[p]) > 0.1)	//精度0.1
					return false;
				else continue;
			
			if (isObject(x[p]) && isObject(y[p])) {
				if (player_cmp(x[p], y[p]) == false)
					return false;
			}
			else return false;
		}
	}
	return true;
};

var player_size = 15;
/*
Q.game_player = function (nickname) {
	this.id = nickname;
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
	
	this.bullet_prop={
		speed : 240,
		reload : 0.6,
		bias : 0.1,
		life : 5,
		damage : 10,
		bounce : false
	};

	this.score = 0;
	this.alpha = 1;
	this.invisible = false;
	this.sight = 1;
};*/

Q.game_player = Q.GameObject.extend({
	init:function(nickname) {
		this.id = nickname;
	this.pos = {
		x: Math.floor(Math.random() * global_width),
		y: Math.floor(Math.random() * global_height)
	};
	this.health = {cur: 100, max: 100};
	this.shield = 0;
	this.speed = {x: {cur: 0, max: 120, acc: 180}, y: {cur: 0, max: 100, acc: 180}};
	this.dir = 0;
	this.color = 0;
	this.size = player_size;
	
	this.bullet_prop={
		speed : 240,
		reload : 0.6,
		bias : 0.1,
		life : 5,
		damage : 10,
		bounce : false
	};

	this.score = 0;
	this.alpha = 1;
	this.invisible = false;
	this.sight = 1;
	}
});

var bullet_size = 5;
Q.bullet = function (p) {
	//基础属性
	this.pos = {x: p.pos.x, y: p.pos.y};
	this.size = bullet_size;
	this.color = p.color;
	this.owner_id = p.id;
	this.destroyable = false;
	this.alpha = 1;

	//可增强属性
	this.speed = p.bullet_prop.speed;
	this.life = {cur: 0, max: p.bullet_prop.life};
	this.bounce = p.bullet_prop.bounce;
	this.damage = p.bullet_prop.damage;

	//弹道偏移
	var b = p.bullet_prop.bias;
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
}

Q.core = Q.Evented.extend({
	global_width:global_width,
	global_height:global_height,

	block_width:20,
	block_height:20,

	tickrate:50,		//客户端和服务器的通信间隔(ms)

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
	
	update_player_physics: function (p, dt, is_no_x, is_no_y) {
		
		
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
			(inputs.kb.indexOf('w') < 0 && inputs.kb.indexOf('s') < 0));
		
		p.dir = inputs.ms;
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
