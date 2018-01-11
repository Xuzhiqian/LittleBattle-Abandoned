if( 'undefined' != typeof global )
	var Quisus = require('./quisus.js');

    var Q = Quisus();
	var global_width = 2400,
		global_height = 1800;

	var map_width = 800;
	var map_height = 600;

	var global_posmin={x:0,y:0},
		global_posmax={x:global_width,y:global_height};

	var player_size = 15;
	var bullet_size = 5;

	var color_table=['super','aqua','Aquamarine','Chartreuse','Coral','LightCyan','LightSlateBlue','RoyalBlue','Violet','VioletRed','Purple','orange']
	var color_table_length = color_table.length;

	var delta_degree = 2*3.1415926/360*100;

	var v_a = function(a,b) {return {x: a.x+b.x , y: a.y+b.y}};
	var v_n = function(a,b) {return {x: a.x*b   , y: a.y*b  }};

	var player_cmp = function( x, y ) {  
    var isNumber = function(x) {return (typeof x =='number');};
    var isString = function(x) {return (typeof x =='string');};
    var isObject = function(x) {return (typeof x =='object');};

        if (x===y) return true;
        for ( var p in x ) {  
            // Inherited properties were tested using x.constructor === y.constructor
            if ( x.hasOwnProperty( p ) ) {  
                // Allows comparing x[ p ] and y[ p ] when set to undefined
                if ( ! y.hasOwnProperty( p ) ) {  
                    return false;  
                }  
  
                // If they have the same strict value or identity then they are equal
                if ( x[ p ] === y[ p ]) continue;

                if (isString(x[p]) || isString(y[p]))
                    if (x[p]!==y[p]) return false;
                        else continue;

                if ((isNumber(x[p]) && !isNumber(y[p]))||(!isNumber(x[p]) && isNumber(y[p])))
                    return false;
                else if (isNumber(x[p]))
                        if (Math.abs(x[p]-y[p])>0.01)
                            return false;
                        else continue;

                if (isObject(x[p]) && isObject(y[p])) {
                    if (player_cmp(x[p],y[p])==false)
                        return false;
                }
                else return false;
            }  
        }  
        return true;  
    }; 


Q.game_player = function(nickname) {
		this.id = nickname;
		this.pos={x:Math.floor(Math.random()*global_width),
			  	  y:Math.floor(Math.random()*global_height)};
		this.health = {cur:100,max:100};
		this.speed={x:{cur:0,max:120,acc:180},y:{cur:0,max:100,acc:180}};
		this.dir = 0;
		this.color=0;
		this.size = player_size;

		this.bullet_bias = 0.1;
		this.bullet_life = 5;
	};


Q.bullet = function(p) {

	this.pos = {x:p.pos.x,y:p.pos.y};
	this.speed = 240;
	this.life = {cur:0,max:p.bullet_life};

	var b = p.bullet_bias;
	var start_dir = p.dir+Math.PI/2*(Math.random()*2*b-b);	//弹道偏移
	this.dir = {x:Math.cos(start_dir),y:Math.sin(start_dir)};
	this.color= p.color;
	this.size = bullet_size;
	this.damage = 10;
	this.owner_id = p.id;
	};

Q.bullet.prototype.update=function(dt){
	this.pos = v_a(this.pos,v_n(this.dir,dt*this.speed));
	if (this.pos.x<0) {
		this.pos.x=0;
		this.dir.x=-this.dir.x;
	}
	if (this.pos.y<0) {
		this.pos.y=0;
		this.dir.y=-this.dir.y;
	}
	if (this.pos.x>global_width) {
		this.pos.x=global_width;
		this.dir.x=-this.dir.x;
	}
	if (this.pos.y>global_height) {
		this.pos.y=global_height;
		this.dir.y=-this.dir.y;
	}
	this.life.cur+=dt;
};

Q.core = Q.Evented.extend({
	move_u:function(p,dt){
		p.speed.y.cur=Math.max(p.speed.y.cur-dt*p.speed.y.acc,-p.speed.y.max);
	},
	move_d:function(p,dt){
		p.speed.y.cur=Math.min(p.speed.y.cur+dt*p.speed.y.acc,p.speed.y.max);  
	},
	move_l:function(p,dt){
		p.speed.x.cur=Math.max(p.speed.x.cur-dt*p.speed.x.acc,-p.speed.x.max);  
	},
	move_r:function(p,dt){
		p.speed.x.cur=Math.min(p.speed.x.cur+dt*p.speed.x.acc,p.speed.x.max);  
	},

	update_player_physics:function(p,dt,is_no_x,is_no_y){
	if (is_no_x) {
		if (p.speed.x.cur>0)
			p.speed.x.cur = Math.max(0,p.speed.x.cur-dt*p.speed.x.acc);
		else
			p.speed.x.cur = Math.min(0,p.speed.x.cur+dt*p.speed.x.acc);
	}
	if (is_no_y) {
		if (p.speed.y.cur>0)
			p.speed.y.cur = Math.max(0,p.speed.y.cur-dt*p.speed.y.acc);
		else
			p.speed.y.cur = Math.min(0,p.speed.y.cur+dt*p.speed.y.acc);
	}
	p.pos.x=p.pos.x+p.speed.x.cur*dt;
	p.pos.y=p.pos.y+p.speed.y.cur*dt;
	if (p.pos.x<0) p.pos.x=0;
	if (p.pos.y<0) p.pos.y=0;
	if (p.pos.x>global_width) 	p.pos.x=global_width;
	if (p.pos.y>global_height) 	p.pos.y=global_height;
	},

	process_inputs:function(p,inputs,dt,isServer) {

	for (var i=0;i<inputs.kb.length;i++) {
				switch (inputs.kb[i]) {
					case 'w':
						this.move_u(p,dt);
						break;
					case 's':
						this.move_d(p,dt);
						break;
					case 'a':
						this.move_l(p,dt);
						break;
					case 'd':
						this.move_r(p,dt);
						break;									
				}
			}
	this.update_player_physics(p,dt,(inputs.kb.indexOf('a')<0 && inputs.kb.indexOf('d')<0),
							   (inputs.kb.indexOf('w')<0 && inputs.kb.indexOf('s')<0));
	p.dir = inputs.ms;
	}
});


if( 'undefined' != typeof global )
   module.exports = global.Q = Q;
