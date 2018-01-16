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
		// Inherited properties were tested using x.constructor === y.constructor
		if (x.hasOwnProperty(p)) {
			// Allows comparing x[ p ] and y[ p ] when set to undefined
			if (!y.hasOwnProperty(p)) {
				return false;
			}
			
			// If they have the same strict value or identity then they are equal
			if (x[p] === y[p]) continue;
			
			if (isString(x[p]) || isString(y[p]))
				if (x[p] !== y[p]) return false;
				else continue;
			
			if ((isNumber(x[p]) && !isNumber(y[p])) || (!isNumber(x[p]) && isNumber(y[p])))
				return false;
			else if (isNumber(x[p]))
				if (Math.abs(x[p] - y[p]) > 0.1)
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
Q.game_player = function (nickname) {
	this.id = nickname;
	this.pos = {
		x: Math.floor(Math.random() * global_width),
		y: Math.floor(Math.random() * global_height)
	};
	this.health = {cur: 100, max: 100};
	this.speed = {x: {cur: 0, max: 120, acc: 180}, y: {cur: 0, max: 100, acc: 180}};
	this.dir = 0;
	this.color = 0;
	this.size = player_size;
	
	this.bullet_bias = 0.1;
	this.bullet_life = 5;
};

var bullet_size = 5;
Q.bullet = function (p) {
	
	this.pos = {x: p.pos.x, y: p.pos.y};
	this.speed = 240;
	this.life = {cur: 0, max: p.bullet_life};
	
	var b = p.bullet_bias;
	var start_dir = p.dir + Math.PI / 2 * (Math.random() * 2 * b - b);	//弹道偏移
	this.dir = {x: Math.cos(start_dir), y: Math.sin(start_dir)};

	this.bounce = false;
	this.color = p.color;
	this.size = bullet_size;
	this.damage = 10;
	this.owner_id = p.id;

	this.destroy = false;
};

Q.bullet.prototype.update = function (dt) {
	this.pos = v_a(this.pos, v_n(this.dir, dt * this.speed));
	if (this.bounce) {
	if (this.pos.x < 0) {
		this.dir.x = -this.dir.x;
	}
	if (this.pos.y < 0) {
		this.dir.y = -this.dir.y;
	}
	if (this.pos.x > global_width) {
		this.dir.x = -this.dir.x;
	}
	if (this.pos.y > global_height) {
		this.dir.y = -this.dir.y;
	}
	}

	this.life.cur += dt;
	if (this.life.cur>this.life.max) this.destroy=true;
};

var sur = [[-1,0],[0,-1],[0,1],[1,0],[-1,-1],[-1,1],[1,-1],[1,1]];
Q.core = Q.Evented.extend({
	global_width:global_width,
	global_height:global_height,

	block_width:20,
	block_height:20,

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
		block_x = Math.floor(p.pos.x / this.block_width);
		block_y = Math.floor(p.pos.y / this.block_height);
		for (var i=0;i<4;i++)
		if (this.terrain[block_x+sur[i][0]][block_y+sur[i][1]]==1) {
			if (sur[i][0]*p.speed.x.cur>0) p.speed.x.cur = 0;
			if (sur[i][1]*p.speed.y.cur>0) p.speed.y.cur = 0;
		}

		p.pos.x = p.pos.x + p.speed.x.cur * dt;
		p.pos.y = p.pos.y + p.speed.y.cur * dt;

		//越界检测
		if (p.pos.x < 0) p.pos.x = 0;
		if (p.pos.y < 0) p.pos.y = 0;
		if (p.pos.x > this.global_width) p.pos.x = this.global_width;
		if (p.pos.y > this.global_height) p.pos.y = this.global_height;
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
	}
});


if ('undefined' != typeof global)
	module.exports = global.Q = Q;
