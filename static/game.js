var socket = io();

function getDistance(x1, y1, x2, y2) {
  return Math.sqrt((x1 - x2)*(x1 - x2) + (y1 - y2)*(y1 - y2));
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

class Projectile {
  constructor(id, x, y, color, range, speed, damage, pierce, impact, direction, movement, owner) {
    this.id = id;
    this.x = x;
    this.y = y;
    this.start = {x: this.x, y: this.y};
    this.color = color;
    this.range = range;
    this.speed = speed;
    this.damage = damage;
    this.pierce = pierce;
    this.impact = impact;
    this.direction = direction;
    this.movement = movement;
    this.owner = owner;
    this.ownerID = this.owner.id;
    this.alreadyHit = [];
  }

  tick() {
    this.x += this.speed * this.direction.x;
    this.y += this.speed * this.direction.y;

    if (this.range < Math.sqrt((this.x - this.start.x)*(this.x - this.start.x)+(this.y - this.start.y)*(this.y - this.start.y))) {
      for (var i in projectiles) {
        if (projectiles[i] == this) {
          projectiles.splice(i, 1);
          break;
        }
      }
    } else {
      for (var i in player.enemies) {
        var enemy = player.enemies[i];
        var hit = false;

        for (var j in this.alreadyHit) {
          if (this.alreadyHit[j] == enemy.id) {
            hit = true;
          }
        }

        if (!hit && this.pierce > 0 && enemy.size*2 > getDistance(this.x, this.y, enemy.x, enemy.y)) {
          socket.emit('damage', i, this.damage, this);
          this.pierce -= 1;
          this.alreadyHit.push(enemy.id);

          if (this.pierce <= 0) {
            for (var j=0; j<projectiles.length; j++) {
              if (projectiles[j] == this) {
                projectiles.splice(j, 1);
                break;
              }
            }
          }
        }
      }
    }
  }
}

class BasicDart extends Projectile {
  constructor(id, x, y, direction, owner) {
    super(id, x, y, 'black', 0.5, 0.03, 1, 1, null, direction, 'straight', owner)
  }
}

class SharperDart extends Projectile {
  constructor(id, x, y, direction, owner) {
    super(id, x, y, 'black', 0.5, 0.03, 1, 2, null, direction, 'straight', owner)
  }
}

class Tower {
  constructor(built, upgradeEffects, x, y, cost, size, color, range, attackTime, damage, projectile, target, ability, owner) {
    this.id = towersBuilt;
    this.upgradeEffects = upgradeEffects;
    this.built = built;
    this.x = x;
    this.y = y;
    this.cost = cost;
    this.size = size;
    this.color = color;
    this.range = range;
    this.attackTime = attackTime;
    this.damage = damage;
    this.projectile = projectile;
    this.target = target;
    this.ability = ability;
    this.owner = owner;
    this.canHitDistances = [];
    this.lastAttackTime = 0;
    this.shotID = 0;
    this.leftUpgrades = 0;
    this.rightUpgrades = 0;
  }

  placed() {
    this.getRange();
  }

  getRange() {
    var step = 0.01;
    var walker = tracks[0].lengths[0];
    var start = 0;
    var edge = 0;
    var withinRange = false;
    var prev = tracks[0].vertices[0];
    var vertex = tracks[0].vertices[1];
    for (var dist=0; dist<tracks[0].distance; dist += step) {
      if (dist >= walker) {
        if (!tracks[0].lengths[edge + 1]) {
          if (withinRange) {
            withinRange = false;
            this.canHitDistances[this.canHitDistances.length-1].push(dist);
          }
          break;
        } else {
          edge += 1;
          start = walker;
          walker += tracks[0].lengths[edge];
          prev = tracks[0].vertices[edge];
          vertex = tracks[0].vertices[edge + 1];
        }
      }

      if (this.range + 0.01 > Math.sqrt((prev.x + (vertex.x - prev.x) * ((dist - start) / (walker - start)) - this.x)*(prev.x + (vertex.x - prev.x) * ((dist - start) / (walker - start)) - this.x) + (prev.y + (vertex.y - prev.y) * ((dist - start) / (walker - start)) - this.y)*(prev.y + (vertex.y - prev.y) * ((dist - start) / (walker - start)) - this.y))) {
        if (!withinRange) {
          withinRange = true;
          this.canHitDistances.push([dist]);
        }
      } else if (withinRange) {
        withinRange = false;
        this.canHitDistances[this.canHitDistances.length-1].push(dist);
      }
    }

    if (withinRange) {
      withinRange = false;
      this.canHitDistances[this.canHitDistances.length-1].push(dist);
    }
  }

  tick() {
    if (!this.built) {
      if (mouseX && mouseY) {
        this.x = mouseX/screen.width;
        this.y = mouseY/screen.height;
      }
    } else {
      if (time - this.lastAttackTime > this.attackTime) {
        var distance;
        var distanceID;

        for (var i in player.enemies) {
          var enemy = player.enemies[i];

          for (var j in this.canHitDistances) {
            if (enemy.progress > this.canHitDistances[j][0] && enemy.progress < this.canHitDistances[j][1]) {
              switch (this.target) {
                case 'first':
                  if (!distance || enemy.progress > distance) {
                    distance = enemy.progress;
                    distanceID = i;
                  }
                  break;
                case 'last':
                  if (!distance || enemy.progress < distance) {
                    distance = enemy.progress;
                    distanceID = i;
                  }
                  break;
                case 'close':
                  if (!distance || Math.sqrt((enemy.x - this.x)*(enemy.x - this.x)+(enemy.y - this.y)*(enemy.y - this.y)) < distance) {
                    distance = Math.sqrt((enemy.x - this.x)*(enemy.x - this.x)+(enemy.y - this.y)*(enemy.y - this.y));
                    distanceID = i;
                  }
                  break;
              }

              break;
            }
          }
        }

        if (distanceID) {
          if (this.projectile && this.projectile != null) {
            var tempX = player.enemies[distanceID].x - this.x;
            var tempY = player.enemies[distanceID].y - this.y;
            var newProjectile = new (eval(this.projectile))(this.shotID, this.x, this.y, {x: tempX / Math.sqrt(tempX*tempX + tempY*tempY), y: tempY / Math.sqrt(tempX*tempX + tempY*tempY)}, this);
            projectiles.push(newProjectile);
            socket.emit('attack', newProjectile);
          } else {
            socket.emit('damage', distanceID, this.damage, null);
          }
          this.shotID += 1;
          this.lastAttackTime = time;
        }
      }
    }
  }

  upgrade(side) {
    switch (side) {
      case 'left':
        if (this.upgradeEffects.left[this.leftUpgrades]) {
          this.upgradeEffects.left[this.leftUpgrades].effect(this);
          this.leftUpgrades += 1;
        }
        break;
      case 'right':
        if (this.upgradeEffects.right[this.rightUpgrades]) {
          this.upgradeEffects.right[this.rightUpgrades].effect(this);
          this.rightUpgrades += 1;
        }
        break;
    }
  }

  canBuildHere() {
    if (this.x > 1 || this.y > 1) {
      return false;
    }

    for (var i in player.towers) {
      var tower = player.towers[i];
      if (tower.size + this.size > getDistance(tower.x, tower.y, this.x, this.y)) {
        return false;
      }
    }

    var step = 0.1;
    var walker = {x: tracks[0].vertices[0].x*screen.width, y: tracks[0].vertices[0].y*screen.height};

    for (var i=1; i<tracks[0].vertices.length; i++) {
      var curr = {x: tracks[0].vertices[i].x*screen.width, y: tracks[0].vertices[i].y*screen.height};
      var prev = {x: tracks[0].vertices[i-1].x*screen.width, y: tracks[0].vertices[i-1].y*screen.height};

      for (var j=0; j<=1/step; j++) {
        if (this.size*((screen.width + screen.height) / 2) + trackWidth/2 > Math.sqrt((walker.x - this.x * screen.width)*(walker.x - this.x * screen.width) + (walker.y - this.y * screen.height)*(walker.y - this.y * screen.height))) {
          return false;
        }

        walker.x = prev.x + (curr.x - prev.x) * (j * step);
        walker.y = prev.y + (curr.y - prev.y) * (j * step);
      }
    }

    return true;
  }
}

//built, upgradeEffects, x, y, cost, size, color, range, attackTime, damage, projectile, target, ability, owner
class Archer extends Tower {
  constructor(x, y) {
    super(false, {left: [{cost: 100, name: 'Keen Eyes', effect: function(tower) {tower.range = 0.4; tower.getRange();}}, {cost: 150, name: 'Sharper Shots', effect: function(tower) {tower.projectile = 'SharperDart';}}], right: [{cost: 100, name: 'Quick Draw', effect: function(tower) {tower.attackTime = 500;}}]}, x, y, 100, 0.03, 'brown', 0.2, 1000, 1, 'BasicDart', defaultTarget, {name: 'An Ability', cost: 0, effect: null}, socket.id);
  }
}

class Sniper extends Tower {
  constructor(x, y) {
    super(false, {left: [{cost: 100, name: '.30 Caliber', effect: function(tower) {tower.damage = 4;}}], right: [{cost: 200, name: 'Rapid Reload', effect: function(tower) {tower.attackTime = 1500;}}]}, x, y, 150, 0.02, 'blue', 1, 2000, 2, null, defaultTarget, {name: 'An Ability', cost: 0, effect: null}, socket.id);
  }
}

class ChainGunner extends Tower {
  constructor(x, y) {
    super(false, {left: [{cost:500, name: 'Load Faster', effect: function(tower) {tower.attackTime = 300;}}, {cost: 1200, name: 'LOAD EVEN FASTER', effect: function(tower) {tower.attackTime = 150;}}], right: [{cost: 6666, name: '10 cm bullets', effect: function(tower) {tower.damage = 5;}}]}, x, y, 1000, 0.02, 'green', .15, 500, 1, 'BasicDart', defaultTarget, {name: 'An Ability', cost: 0, effect: null}, socket.id);
  }
}


class Button {
  constructor(side, x, y, name, cost, width, height, visible, onClick) {
    this.side = side;
    this.x = x;
    this.y = y;
    this.name = name;
    this.cost = cost;
    this.width = width;
    this.height = height;
    this.visible = visible;
    this.onClick = onClick;
  }
}

socket.on('message', function(data) {
  console.log(data);
});

var canvas = document.getElementById('canvas');
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;
var context = canvas.getContext('2d');

context.fillStyle = 'black';
context.textAlign = 'center';
context.font = '32px Arial';
context.fillText('Finding Match', canvas.width/2, canvas.height/10);

var buttonWidth;
var buttonHeight;
var buttonIndent;
var buttonSpaceX;
var buttonSpaceY;
var menuHeight;
var statsWidth;
var screen;
var player;
var opponent;
var holding;
var trackWidth;
var selected = null;
var selectedObject = null;
var tracks = [];
var buttons = [];
var towers = [];
var projectiles = [];
var time = 0;
var lastIncome = 0;
var mouseX = 0;
var mouseY = 0;
var towersBuilt = 0;
var defaultTarget = 'first';
var buttons = [
  new Button(side=0, x=0, y=0, name=function () {return player.canBuild[0];}, cost=function () {var tower = new (eval(player.canBuild[0]))(mouseX, mouseY); return tower.cost;}, width=1, height=1, visible=null, onClick=function() {var tower = new (eval(player.canBuild[0]))(mouseX, mouseY); if (player.gold >= tower.cost) {holding = tower;}}),
  new Button(side=0, x=1, y=0, name=function () {return player.canBuild[1];}, cost=function () {var tower = new (eval(player.canBuild[1]))(mouseX, mouseY); return tower.cost;}, width=1, height=1, visible=null, onClick=function() {var tower = new (eval(player.canBuild[1]))(mouseX, mouseY); if (player.gold >= tower.cost) {holding = tower;}}),
  new Button(side=0, x=2, y=0, name=function () {return player.canBuild[2];}, cost=function () {var tower = new (eval(player.canBuild[2]))(mouseX, mouseY); return tower.cost;}, width=1, height=1, visible=null, onClick=function() {var tower = new (eval(player.canBuild[2]))(mouseX, mouseY); if (player.gold >= tower.cost) {holding = tower;}}),  
  new Button(side=0, x=0.09, y=1, name=function () {return player.canBuild[0].ability.name;}, cost=function () {var tower = new (eval(player.canBuild[0]))(0, 0); return tower.ability.cost;}, width=0.75, height=0.75, visible=null, onClick=function() {var tower = new (eval(player.canBuild[1]))(mouseX, mouseY); if (player.gold >= tower.cost) {holding = tower;}}),
  new Button(side=0, x=1.09, y=1, name=function () {return player.canBuild[1].ability.name;}, cost=function () {var tower = new (eval(player.canBuild[1]))(0, 0); return tower.ability.cost;}, width=0.75, height=0.75, visible=null, onClick=function() {var tower = new (eval(player.canBuild[1]))(mouseX, mouseY); if (player.gold >= tower.cost) {holding = tower;}}),
  new Button(side=1, x=0, y=0, name=function () {return (selectedObject.upgradeEffects.left[selectedObject.leftUpgrades] ? selectedObject.upgradeEffects.left[selectedObject.leftUpgrades].name : 'No More Upgrades');}, cost=function () {return (selectedObject.upgradeEffects.left[selectedObject.leftUpgrades] ? selectedObject.upgradeEffects.left[selectedObject.leftUpgrades].cost : 0);}, width=2, height=2, visible='tower', onClick=function() {if (selectedObject.upgradeEffects.left[selectedObject.leftUpgrades]) {if (player.gold >= selectedObject.upgradeEffects.left[selectedObject.leftUpgrades].cost) {socket.emit('expense', selectedObject.upgradeEffects.left[selectedObject.leftUpgrades].cost); selectedObject.upgrade('left');}}}),
  new Button(side=1, x=2, y=0, name=function () {return (selectedObject.upgradeEffects.right[selectedObject.rightUpgrades] ? selectedObject.upgradeEffects.right[selectedObject.rightUpgrades].name : 'No More Upgrades');}, cost=function () {return (selectedObject.upgradeEffects.right[selectedObject.rightUpgrades] ? selectedObject.upgradeEffects.right[selectedObject.rightUpgrades].cost : 0);}, width=2, height=2, visible='tower', onClick=function() {if (selectedObject.upgradeEffects.right[selectedObject.rightUpgrades]) {if (player.gold >= selectedObject.upgradeEffects.right[selectedObject.rightUpgrades].cost) {socket.emit('expense', selectedObject.upgradeEffects.right[selectedObject.rightUpgrades].cost); selectedObject.upgrade('right');}}}),
];

socket.on('state', function(game) {
  time = game.time;

  canvas = document.getElementById('canvas');
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  context = canvas.getContext('2d');

  buttonWidth = 0.03 * canvas.width;
  buttonHeight = 0.06 * canvas.height;
  buttonIndent = 0.01 * canvas.width;
  buttonSpaceX = 0.01 * canvas.width;
  buttonSpaceY = 0.02 * canvas.height;
  menuHeight = 0.2 * canvas.height
  statsWidth = 0.1 * canvas.width;

  player = game.players[socket.id];
  opponent = game.players[player.opponent];
  tracks = [player.track, opponent.track];
  screen = {width: canvas.width/2, height: canvas.height - menuHeight};
  trackWidth = 0.05 * ((screen.width + screen.height) / 2);

  context.clearRect(0, 0, canvas.width, canvas.height);

  context.fillStyle = 'green';
  context.fillRect(0, 0, canvas.width, canvas.height);

  if (tracks.length > 0) {
    context.beginPath();
    context.lineWidth = trackWidth;
    context.strokeStyle = 'white';
    for (var i in tracks[0].vertices) {
      var vertex = tracks[0].vertices[i];
      context.lineTo(vertex.x * screen.width, vertex.y * screen.height);
      context.stroke();
    }
    context.closePath();

    context.beginPath();
    context.lineWidth = trackWidth;
    context.strokeStyle = 'white';
    for (var i in tracks[1].vertices) {
      var vertex = tracks[1].vertices[i];
      context.lineTo(screen.width + vertex.x * screen.width, vertex.y * screen.height);
      context.stroke();
    }
    context.closePath();
  }

  context.fillStyle = 'brown';
  context.fillRect(0, canvas.height - menuHeight, canvas.width, menuHeight);

  context.lineWidth = 0.002 * canvas.width;
  context.strokeStyle = 'black';
  context.beginPath();
  context.moveTo(canvas.width/2, 0);
  context.lineTo(canvas.width/2, canvas.height);
  context.stroke();
  context.closePath();

  for (var i in buttons) {
    var button = buttons[i];
    if (button.visible == selected) {
      context.beginPath();
      context.rect(buttonIndent + button.x * (buttonWidth + buttonSpaceX) + button.side * (canvas.width/2 + statsWidth/2), canvas.height - menuHeight + buttonIndent + button.y * (buttonHeight + buttonSpaceY), button.width * buttonWidth, button.height * buttonHeight);
      context.stroke();
      context.closePath();

      var cost = button.cost();

      if (cost != 0) {
        context.beginPath();
        context.fillStyle = 'white';
        context.textAlign = 'center';
        context.font = String(0.03*canvas.height) + 'px Arial';
        context.strokeText(button.cost(), buttonIndent + button.x * (buttonWidth + buttonSpaceX) + button.side * (canvas.width/2 + statsWidth/2) + (button.width * buttonWidth)/2, canvas.height - menuHeight + buttonIndent + button.y * (buttonHeight + buttonSpaceY) + button.height * buttonHeight + 0.008 * screen.height);
        context.fillText(button.cost(), buttonIndent + button.x * (buttonWidth + buttonSpaceX) + button.side * (canvas.width/2 + statsWidth/2) + (button.width * buttonWidth)/2, canvas.height - menuHeight + buttonIndent + button.y * (buttonHeight + buttonSpaceY) + button.height * buttonHeight + 0.008 * screen.height);
        context.closePath();
      }
    }
  }

  context.fillStyle = 'black';
  context.fillRect(canvas.width/2 - statsWidth/2, canvas.height - menuHeight, statsWidth, menuHeight);

  context.fillStyle = 'white';
  context.textAlign = 'center';
  context.font = String(0.02*canvas.height) + 'px Arial';
  context.fillText(Math.floor(time/1000), canvas.width/2, canvas.height - menuHeight + 0.03*canvas.height);

  if (player) {
    context.fillStyle = 'red';
    context.fillText(player.lives, canvas.width/2, canvas.height - menuHeight + 0.07*canvas.height);

    context.fillStyle = 'yellow';
    context.fillText(player.gold, canvas.width/2, canvas.height - menuHeight + 0.11*canvas.height);

    context.textAlign = 'right';
    context.fillStyle = 'green';
    context.fillText(player.income, canvas.width/2 - 0.008*canvas.width, canvas.height - menuHeight + 0.15*canvas.height);

    context.textAlign = 'center';
    context.fillStyle = 'white';
    context.fillText('x', canvas.width/2, canvas.height - menuHeight + 0.15*canvas.height);

    context.textAlign = 'left';
    context.fillStyle = 'gray';
    context.fillText(player.honor.toFixed(2), canvas.width/2 + 0.008*canvas.width, canvas.height - menuHeight + 0.15*canvas.height);

    if (time - lastIncome >= player.incomeTime) {
      lastIncome += player.incomeTime;
      socket.emit('income');
    }

    if (holding && holding) {
      holding.tick();
      context.moveTo(holding.x * screen.width, holding.y * screen.height);
      context.fillStyle = holding.color;
      context.beginPath();
      context.arc(holding.x * screen.width, holding.y * screen.height, holding.size * ((screen.width + screen.height) / 2), 0, 2*Math.PI, false);
      context.fill();
      context.closePath();
      if (holding.canBuildHere()) {
        context.fillStyle = 'rgba(50, 50, 50, 0.5)';
      } else {
        context.fillStyle = 'rgba(255, 0, 0, 0.5)';
      }
      context.beginPath();
      context.arc(holding.x * screen.width, holding.y * screen.height, holding.range * ((screen.width + screen.height) / 2), 0, 2*Math.PI, false);
      context.fill();
      context.closePath();
    }

    for (var i in towers) {
      towers[i].tick();
    }

    for (var i=projectiles.length-1; i>=0; i--) {
      projectiles[i].tick();
    }

    for (var i in player.towers) {
      var tower = player.towers[i];
      
      context.moveTo(tower.x * screen.width, tower.y * screen.height);
      context.fillStyle = tower.color;
      context.beginPath();
      context.arc(tower.x * screen.width, tower.y * screen.height, tower.size * ((screen.width + screen.height) / 2), 0, 2*Math.PI, false);
      context.fill();
      context.closePath();
    }

    for (var i in opponent.towers) {
      var tower = opponent.towers[i];
      
      context.moveTo(screen.width + tower.x * screen.width, tower.y * screen.height);
      context.fillStyle = tower.color;
      context.beginPath();
      context.arc(screen.width + tower.x * screen.width, tower.y * screen.height, tower.size * ((screen.width + screen.height) / 2), 0, 2*Math.PI, false);
      context.fill();
      context.closePath();
    }

    for (var i in player.enemies) {
      var enemy = player.enemies[i];

      context.fillStyle = enemy.color;
      context.beginPath();
      context.arc(enemy.x * screen.width, enemy.y * screen.height, enemy.size * ((screen.width + screen.height) / 2), 0, 2*Math.PI, false);
      context.fill();
      context.closePath();
    }

    for (var i in opponent.enemies) {
      var enemy = opponent.enemies[i];

      context.fillStyle = enemy.color;
      context.beginPath();
      context.arc(screen.width + enemy.x * screen.width, enemy.y * screen.height, enemy.size * ((screen.width + screen.height) / 2), 0, 2*Math.PI, false);
      context.fill();
      context.closePath();
    }

    for (var i in player.projectiles) {
      var projectile = player.projectiles[i];
      
      context.lineWidth = 4;
      context.strokeStyle = projectile.color;
      context.beginPath();
      context.moveTo(projectile.x*screen.width, projectile.y*screen.height);
      context.lineTo(projectile.x*screen.width - 32*projectile.direction.x, projectile.y*screen.height - 32*projectile.direction.y);
      context.stroke();
      context.closePath();
    }

    for (var i in opponent.projectiles) {
      var projectile = opponent.projectiles[i];
      
      context.lineWidth = 4;
      context.strokeStyle = projectile.color;
      context.beginPath();
      context.moveTo(screen.width + projectile.x*screen.width, projectile.y*screen.height);
      context.lineTo(screen.width + projectile.x*screen.width - 32*projectile.direction.x, projectile.y*screen.height - 32*projectile.direction.y);
      context.stroke();
      context.closePath();
    }
  }
});

document.addEventListener('click', function(event) {
  if (holding) {
    if (holding.canBuildHere()) {
      holding.built = true;
      socket.emit('built', holding);
      towers.push(holding);
      holding.placed();
      selected = 'tower';
      selectedObject = holding;
      holding = null;
      towersBuilt += 1;
    }
  } else {
    for (var i=0; i<buttons.length; i++) {
      var button = buttons[i];
      if (button.visible == selected && event.clientX > buttonIndent + button.x * (buttonWidth + buttonSpaceX) + button.side * (canvas.width/2 + statsWidth/2) && event.clientX < buttonIndent + button.x * (buttonWidth + buttonSpaceX) + button.side * (canvas.width/2 + statsWidth/2) + button.width * buttonWidth && event.clientY > canvas.height - menuHeight + buttonIndent + button.y * (buttonHeight + buttonSpaceY) && event.clientY < canvas.height - menuHeight + buttonIndent + button.y * (buttonHeight + buttonSpaceY) + button.height * buttonHeight) {
        button.onClick();
      }
    }

    for (var i in towers) {
      var tower = towers[i];
      if (tower.size*((screen.width+screen.height)/2) > getDistance(tower.x*screen.width, tower.y*screen.height, event.clientX, event.clientY)) {
        selected = 'tower';
        selectedObject = towers[i];
        return;
      }
    }

    if (event.clientY < canvas.height - menuHeight) {
      selected = null;
      selectedObject = null;
    }
  }
});

document.onmousemove = function(event) {
  event = event || window.event;

  if (mouseY < canvas.height - menuHeight && event.clientY > canvas.height - menuHeight) {
    holding = null;
  }

  mouseX = event.clientX;
  mouseY = event.clientY;
};

document.addEventListener('keydown', function(event) {
  /*switch (event.keyCode) {
    case 65: // A
      movement.left = true;
      break;
    case 87: // W
      movement.up = true;
      break;
    case 68: // D
      movement.right = true;
      break;
    case 83: // S
      movement.down = true;
      break;
  }*/
});

document.addEventListener('keyup', function(event) {
  /*switch (event.keyCode) {
    case 65: // A
      movement.left = false;
      break;
    case 87: // W
      movement.up = false;
      break;
    case 68: // D
      movement.right = false;
      break;
    case 83: // S
      movement.down = false;
      break;
  }*/
});

socket.emit('new player');