var express = require('express');
var http = require('http');
var path = require('path');
var socketIO = require('socket.io');
var app = express();
var server = http.Server(app);
var io = socketIO(server);
var users = {};
var games = {};
var lobby = [];
var port = 5000;

app.set('port', port);
app.use('/static', express.static(__dirname + '/static'));

app.get('/', function(request, response) {
  response.sendFile(path.join(__dirname, 'index.html'));
});

server.listen(port, function() {
  console.log('Starting server on port ' + port);
});

class Track {
	constructor(name, vertices) {
		this.name = name;
		this.vertices = vertices;
		this.lengths = [];
		this.distance = 0;

		for (var i=1; i<this.vertices.length; i++) {
			var vertex = this.vertices[i];
			var prev = this.vertices[i-1];

			var dist = Math.sqrt((vertex.x - prev.x)*(vertex.x - prev.x) + (vertex.y - prev.y)*(vertex.y - prev.y));
			this.distance += (dist);
			this.lengths.push(dist);
		}
	}

	distanceToXY(dist) {
		var walker = 0;
		var start = 0;
		for (var i=0; i<this.lengths.length; i++) {
			start = walker;
			walker += this.lengths[i];
			if (dist < walker) {
				var vertex = this.vertices[i+1];
				var prev = this.vertices[i];

				return (new Point(prev.x + (vertex.x - prev.x) * ((dist - start) / (walker - start)), prev.y + (vertex.y - prev.y) * ((dist - start) / (walker - start))));
			}
		}
	}
}

class Point {
	constructor(x, y) {
		this.x = x;
		this.y = y;
	}

	distanceTo(x, y) {
		return Math.sqrt((x - this.x)*(x - this.x) + (y - this.y)*(y - this.y));
	}
}

var tracks = [new Track(name='track1', vertices=[new Point(0.5, 0), new Point(0.5, 0.2), new Point(0.2, 0.5), new Point(0.3, 0.6), new Point(0.7, 0.2), new Point(0.8, 0.3), new Point(0.5, 0.6), new Point(0.5, 1)])]

class Enemy {
	constructor(id, size, color, speed, progress, hp, damage, owner, gameID) {
		this.id = id;
		this.progress = progress;
		this.gameID = gameID;
		this.owner = owner;
		var location = games[this.gameID].players[this.owner].track.distanceToXY(this.progress);
		this.x = location.x;
		this.y = location.y;
		this.size = size;
		this.color = color;
		this.speed = speed;
		this.hp = hp;
		this.damage = damage;
	}

	tick() {
		this.progress += this.speed;
		if (this.progress < games[this.gameID].players[this.owner].track.distance) {
			var location = games[this.gameID].players[this.owner].track.distanceToXY(this.progress);
			this.x = location.x;
			this.y = location.y;
		} else {
			for (var i=0; i<games[this.gameID].players[this.owner].enemies.length; i++) {
				if (games[this.gameID].players[this.owner].enemies[i] == this) {
					games[this.gameID].players[this.owner].lives -= this.damage;
					games[this.gameID].players[this.owner].enemies.splice(i, 1);
					break;
				}
			}
		}
	}

	takeDamage(damage) {
		this.hp -= damage;

		if (this.hp <= 0) {
			for (var i=0; i<games[this.gameID].players[this.owner].enemies.length; i++) {
				if (games[this.gameID].players[this.owner].enemies[i] == this) {
					games[this.gameID].players[this.owner].enemies.splice(i, 1);
					break;
				}
			}
		}
	}
}

class Grunt extends Enemy {
	constructor(id, owner, gameID) {
		super(id, 0.015, 'red', 0.002, 0, 1, 1, owner, gameID);
	}
}

class Raider extends Enemy {
	constructor(id, owner, gameID) {
		super(id, 0.022, 'blue', 0.0035, 0, 2, 2, owner, gameID);
	}
}


class Wave {
	constructor(enemy, number, timeBetween, timeAfter) {
		this.enemy = enemy;
		this.quantity = quantity;
		this.timeBetween = timeBetween;
		this.timeAfter = timeAfter;
	}
}

var waves = [
	[
	new Wave(enemy='Grunt', quantity=10, timeBetween=500, timeAfter=15000)
	],
	[
	new Wave(enemy='Grunt', quantity=10, timeBetween=250, timeAfter=500),
	new Wave(enemy='Raider', quantity=10, timeBetween=400, timeAfter=10000)
	],
	[
	new Wave(enemy='Grunt', quantity=10, timeBetween=500, timeAfter=1000),
	new Wave(enemy='Raider', quantity=20, timeBetween=400, timeAfter=10000)
	],
	[
	new Wave(enemy='Raider', quantity=30, timeBetween=300, timeAfter=10000)
	],
	[
	new Wave(enemy='Raider', quantity=100, timeBetween=50, timeAfter=10000)
	],
	[
	new Wave(enemy='Raider', quantity=500, timeBetween=50, timeAfter=10000)
	]
];

io.on('connection', function(socket) {
	socket.on('new player', function() {
    	users[socket.id] = {
    		id: socket.id,
    		name: 'player',
    		wins: 0,
    		losses: 0,
    		inGame: null
    	}

    	findMatch(socket);
	});
	socket.on('income', function() {
    	var player = games[users[socket.id].inGame].players[socket.id];
    	player.gold += player.income * player.honor;
	});
	socket.on('built', function(tower) {
    	var player = games[users[socket.id].inGame].players[socket.id];
    	player.gold -= tower.cost;
    	player.towers.push(tower);
	});
	socket.on('expense', function(cost) {
		var player = games[users[socket.id].inGame].players[socket.id];
		player.gold -= cost;
	});
	socket.on('attack', function(projectile) {
    	var player = games[users[socket.id].inGame].players[socket.id];
    	player.projectiles.push(projectile);
	});
	socket.on('damage', function(enemyID, damage, projectile) {
		try {
	    	var player = games[users[socket.id].inGame].players[socket.id];

	    	if (projectile && projectile != null) {
		    	for (var i in player.projectiles) {
		    		if (player.projectiles[i].ownerID == projectile.ownerID && player.projectiles[i].id == projectile.id) {
		    			player.projectiles[i].pierce -= 1;

		    			if (player.projectiles[i].pierce <= 0) {
		    				player.projectiles.splice(i, 1);
		    				break;
		    			}
		    		}
		    	}
		    }

	    	player.enemies[enemyID].takeDamage(damage);
	    } catch (e) {
	    	console.log(e);
	    }
	});
	socket.on('disconnect', function() {
		if (users[socket.id]) {
			if (users[socket.id].inGame == null) {
				for (var i=0; i<lobby.length; i++) {
					if (lobby[i] == users[socket.id]) {
						lobby.splice(i, 1);
					}
				}
			} else {
				var game = games[users[socket.id].inGame];
				users[game.players[socket.id].opponent].inGame = null;
				findMatch(users[game.players[socket.id].opponent]);

				delete games[users[socket.id].inGame];
			}

			delete users[socket.id];
		}
   	});
});

function findMatch(socket) {
	if (lobby.length > 0) {
    	var firstInLine = lobby.splice(0, 1)[0].id;
    	var gameid = String(firstInLine) + String(socket.id);

    	games[gameid] = {
    		id: gameid,
    		startTime: new Date(),
    		lastSpawnTime: 0,
    		waitTime: 0,
    		time: 0,
    		wave: 0,
    		subwave: 0,
    		spawnNumber: 0,
    		enemyID: 0,
    		players: {}
    	};

    	games[gameid].players[firstInLine] = {
		    id: firstInLine,
		    opponent: socket.id,
		    track: tracks[0],
		    lives: 100,
		    gold: 300000,
		    income: 100,
		    honor: 1,
		    incomeTime: 6000,
		    canBuild: ['Archer', 'Sniper', 'ChainGunner'],
		    towers: [],
		    projectiles: [],
		    enemies: []
		};

		games[gameid].players[socket.id] = {
		    id: socket.id,
		    opponent: firstInLine,
		    track: tracks[0],
		    lives: 100,
		    gold: 300000,
		    income: 100,
		    honor: 1,
		    incomeTime: 6000,
		    canBuild: ['Archer', 'Sniper', 'ChainGunner'],
		    towers: [],
		    projectiles: [],
		    enemies: []
		}

    	users[socket.id].inGame = gameid;
    	users[firstInLine].inGame = gameid;
    } else {
    	lobby.push(users[socket.id]);
    }
}

setInterval(function() {
	try {	
		for (var i in games) {
			var game = games[i];

			game.time = new Date() - game.startTime;

			if (waves[game.wave]) {
				var currWave = waves[game.wave][game.subwave];

				if (game.waitTime != 0) {
					if (game.time - game.lastSpawnTime > game.waitTime) {
						for (var j in game.players) {
							var player = game.players[j];
							player.enemies.push(new (eval(currWave.enemy))(id=game.enemyID, owner=player.id, gameID=game.id));
							game.enemyID += 1;
						}

						game.spawnNumber += 1;

						if (game.spawnNumber >= currWave.quantity) {
							if (waves[game.wave][game.subwave + 1]) {
								game.subwave += 1;
								game.spawnNumber = 0;
								game.waitTime = currWave.timeAfter;
							} else {
								game.wave += 1;
								game.subwave = 0;
								game.spawnNumber = 0;
								game.waitTime = currWave.timeAfter;
							}
						}

						game.lastSpawnTime += game.waitTime;
						game.waitTime = 0;
					}
				} else if (game.spawnNumber < currWave.quantity) {
					if (game.time - game.lastSpawnTime > currWave.timeBetween) {
						for (var j in game.players) {
							var player = game.players[j];
							player.enemies.push(new (eval(currWave.enemy))(id=game.enemyID, owner=player.id, gameID=game.id));
							game.enemyID += 1;
						}

						game.spawnNumber += 1;

						if (game.spawnNumber >= currWave.quantity) {
							if (waves[game.wave][game.subwave + 1]) {
								game.subwave += 1;
								game.spawnNumber = 0;
								game.waitTime = currWave.timeAfter;
							} else {
								game.wave += 1;
								game.subwave = 0;
								game.spawnNumber = 0;
								game.waitTime = currWave.timeAfter;
							}
						}

						game.lastSpawnTime += currWave.timeBetween;
					}
				}
			}

			for (var j in game.players) {
				var player = game.players[j];

				for (var k=player.projectiles.length-1; k>=0; k--) {
					var projectile = player.projectiles[k];

					projectile.x += projectile.speed * projectile.direction.x;
					projectile.y += projectile.speed * projectile.direction.y;

					if (projectile.range < Math.sqrt((projectile.x - projectile.start.x)*(projectile.x - projectile.start.x)+(projectile.y - projectile.start.y)*(projectile.y - projectile.start.y))) {
				    	player.projectiles.splice(k, 1);
					}
				}

				for (var k in player.enemies) {
					game.players[j].enemies[k].tick();
				}

				io.to(player.id).emit('state', game);
			}

			//io.sockets.emit('state', players, buttons, currentTrack);
		}
	} catch (e) {
		console.log(e);
	}

}, 1000 / 60);