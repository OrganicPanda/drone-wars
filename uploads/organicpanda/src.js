/* jshint worker: true, latedef: false */
/* global cortex */

// Import cortex for helpers.
importScripts('/scripts/brains/cortex.js');

// Deltas between 2 points
function getDeltas(point1, point2) {
  return {
    x: point2.x - point1.x,
    y: point2.y - point1.y
  };
}

// Distance between 2 points
function getDistance(point1, point2) {
  var deltas = getDeltas(point1, point2);
 
  return Math.sqrt((deltas.x * deltas.x) + (deltas.y * deltas.y));
}

// Find the closest thing
function getClosest(things, robot) {
  var closest = Object.keys(things).filter(function(key) {
    return key !== robot.id;
  }).map(function(key) {
    return {
      id: key,
      distance: getDistance(things[key].position, robot.position)
    }
  }).sort(function(a, b) {
    return a.distance - b.distance;
  }).shift();

  if (closest) return closest.id;
}

function stalker() {
  'use strict';

  var closestRobot = null
    , closestRobotId = null
    , sideTolerance = 200;

  return function (data, callback) {
    var robot = data.robot
      , newClosestRobotId = null
      , maxVelocity = 0.005
      , increase = 0.00001;

    var message = {
      acceleration: { x: 0, y: 0 },
      token: data.token
    };

    newClosestRobotId = getClosest(data.status.robots, robot);

    if (closestRobotId !== newClosestRobotId) {
      closestRobotId = newClosestRobotId;
    }

    closestRobot = data.status.robots[closestRobotId];

    var deltas = getDeltas(closestRobot.position, robot.position);
    //var distance = getDistance(closestRobot.position, robot.position);
    var accelerationX = deltas.x * increase;
    var accelerationY = deltas.y * increase;

    // Accelerate toward the closest robot as quickly as possible.
    if (robot.velocity.x > maxVelocity || robot.velocity.x < -maxVelocity) {
      message.acceleration.x = 0;
    } else {
      message.acceleration.x -= accelerationX;
    }

    if (robot.velocity.y > maxVelocity || robot.velocity.y < -maxVelocity) {
      message.acceleration.y = 0;
    } else {
      message.acceleration.y -= accelerationY;
    }

    // If I have reloaded, fire at the enemy.
    if (robot.timeSinceLastShot >= robot.rearmDuration) {
      message.fire = { x: closestRobot.position.x, y: closestRobot.position.y };
    }

    // If I'm getting too close to the western boundary. Move away from it.
    if (robot.position.x < sideTolerance) {
      message.acceleration.x = robot.maxAcceleration;
    }

    // If I'm getting too close to the eastern boundary. Move away from it.
    if (robot.position.x > data.status.field.width - sideTolerance) {
      message.acceleration.x = -robot.maxAcceleration;
    }

    // If I'm getting too close to the northern boundary. Move away from it.
    if (robot.position.y < sideTolerance) {
      message.acceleration.y = robot.maxAcceleration;
    }

    // If I'm getting too close to the southern boundary. Move away from it.
    if (robot.position.y > data.status.field.height - sideTolerance) {
      message.acceleration.y = -robot.maxAcceleration;
    }

    callback(null, message, false);
  };
}

function target(data, callback) {
  'use strict';

  var message = {
    acceleration: { x: 0, y: 0 },
    token: data.token
  };

  var robots = data.status.robots;
  var robot = data.robot;

  // Make a list of enemy IDs.
  var ids = Object.keys(robots);

  // Remove my ID from the list.
  ids.splice(ids.indexOf(robot.id), 1);

  // Select a random target.
  var targetId = ids[Math.floor(Math.random() * ids.length)];

  // No target was selected, so I'm the only one left in the battlefield. Someone may arrive later
  // though, so continue to target.
  if (!targetId) {
    return callback(null, message, false);
  }

  // A new target has been acquired. Time to go hunting.
  queue.add(stalker());

  // This action is now done.
  callback(null, message, true);
}

// Create the queue.
var queue = new cortex.Queue();

// The first action is to target an enemy.
queue.add(target);

// Feed the queue to cortex.init to begin listening for data from my body.
cortex.init(queue.decider);
