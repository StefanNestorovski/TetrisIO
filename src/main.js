var utils = require('./utils.js');
var consts = require('./consts.js');
var shapes = require('./shapes.js');
var views = require('./views.js');
var canvas = require('./canvas.js');

const io = require('socket.io-client');
const socket = io();

/**
	Init game matrix
*/
var initMatrix = function(rowCount,columnCount){
	var result = [];
	for (var i = 0; i<rowCount;i++){
		var row = [];
		result.push(row);
		for(var j = 0;j<columnCount;j++){
			row.push(0);
		}
	}

	return result;
};

/**
  Clear game matrix
*/
var clearMatrix = function(matrix){
	for(var i = 0;i<matrix.length;i++){
		for(var j = 0;j<matrix[i].length;j++){
			matrix[i][j] = 0;
		}
	}
};

/**
	Check all full rows in game matrix
	return rows number array. eg: [18,19];
*/
var checkFullRows = function(matrix){
	var rowNumbers = [];
  	for(var i = 0;i<matrix.length;i++){
  		var row = matrix[i];
  		var full = true;
  		for(var j = 0;j<row.length;j++){
  			full = full&&row[j]!==0&&row[j]!=="#000000";
  		}
  		if (full){
  			rowNumbers.push(i);
  		}
  	}
  	return rowNumbers;
};

/**
	Remove one row from game matrix.
	copy each previous row data to  next row  which row number less than row;
*/
var removeOneRow = function(matrix,row){
	var colCount = matrix[0].length;
	for(var i = row;i>=0;i--){
		for(var j = 0;j<colCount;j++){
			if (i>0){
				matrix[i][j] = matrix[i-1][j];
			}else{
				matrix[i][j] = 0 ;
			}
		}
	}
};
/**
	Remove rows from game matrix by row numbers.
*/
var removeRows = function(matrix,rows){
	for(var i in rows){
		removeOneRow(matrix,rows[i]);
	}
};

/**
	Check game data to determine whether the  game is over
*/
var checkGameOver = function(matrix){

	var firstRow = matrix[0];
	for(var i = 0;i<firstRow.length;i++){
		if (firstRow[i]!==0){
			return true;
		};
	}
	return false;
};


/**
	Calculate  the extra rewards add to the score
*/
var calcRewards = function(rows){
	if (rows&&rows.length>1){
		return Math.pow(2,rows.length - 1)*100;
	}
	return 0;
};

/**
	Calculate game score
*/
var calcScore = function(rows){
	if (rows&&rows.length){
		return rows.length*100;
	}
	return 0;
};

//Calculate time interval by level, the higher the level,the faster shape moves
var calcIntervalByLevel = function(level){
	return consts.DEFAULT_INTERVAL  - (level-1)*60;
};

// Default max scene size
var defaults = {
	maxHeight:700,
	maxWidth:600
};




/**
	Tetris main object defination
*/

// Tetris initialize
let cfg = utils.extend(defaults);
let interval = consts.DEFAULT_INTERVAL;
let isGameOver = false;
let running = false;
let searchingForGame = false;
let socketInterval;
let otherPlayerId;
let preparedShape;
let rowsToAdd = 0;

views.init('tetris',cfg.maxWidth,cfg.maxHeight);
canvas.init(views.scene,views.preview,views.otherPlayer);
matrix = initMatrix(consts.ROW_COUNT,consts.COLUMN_COUNT);

reset();
_fireShape();

// Tetris Main Menu
function toMainMenu() {
    if (searchingForGame) {
        searchingForGame = false;
        socket.emit('notLookingForGame', authId);
    }
    views.setMainMenu();
}

// Tetris singleplayer game
function startSinglePlayer() {
    views.setGameStart(false);
    running = true;
    window.requestAnimationFrame(_refresh);
}

// Tetris search for multiplayer game
function searchForPlayers() {
    searchingForGame = true;
    views.setSeachingPlayers();
    socket.emit('lookingForGame', authId);
    console.log("waiting for game " + authId)
    socket.on('startMatch', (otherId) => {
        startMultiPlayer(otherId);
    });
}

// Tetris multiplayer game
function startMultiPlayer(otherId) {
    views.setGameStart(true);
    running = true;
    window.requestAnimationFrame(_refresh);

    searchForPlayers = false;
    console.log(otherId);
    socket.off('startMatch');
    otherPlayerId = otherId;

    socketInterval = setInterval(() => {
        const otherCanvasMatrix = matrix.map(arr => arr.slice());
        if (shape) {
            let shapeMatrix = shape.matrix();
            for (let j = 0; j < shapeMatrix.length; j++) {
                for (let i = 0; i < shapeMatrix[j].length; i++) {
                    if(shapeMatrix[j][i] === 1) {
                        otherCanvasMatrix[shape.y + j][shape.x + i] = shape.color;
                    }
                }
            }
        }
        socket.emit('clientUpdate', otherPlayerId, JSON.stringify({user:otherPlayerId,matrix:otherCanvasMatrix,done:isGameOver, rows: rowsToAdd}));
        rowsToAdd = 0;
    }, 200);
    socket.on('serverGameUpdate',  (message) => {
        const parsed = JSON.parse(message);
        if (Number(parsed.user) === Number(authId)) {
            canvas.drawSceneOther();
            canvas.drawMatrixOther(parsed.matrix);
            if (parsed.rows != 0) {
                _addDeadRow(parsed.rows)
            }
            if (parsed.done) {
                socket.off('serverGameUpdate');
                views.setGameOver(true, true);
                pause();
            }
        }
    })
}

// Tetris Game Over screen

// Add a unremovable row at the bottom / Multiplayer feature
function _addDeadRow(amount) {
    for (const i = 0; i < amount; i++) {
        let row = [];
        for(let j = 0; j < consts.COLUMN_COUNT; j++){
            row.push('#000000');
        }
        matrix.push(row);
        matrix.shift();
    }
}

// Check and update game data
function _check() {
    let rows = checkFullRows(matrix);
    if (rows.length){
        if (rows.length > 1) {
            rowsToAdd = rows.length - 1;
        }
        removeRows(matrix,rows);

        score += calcScore(rows) + calcRewards(rows);

        views.setScore(score);
        views.setReward(reward);
    }
}

// Check and update game level
function _checkLevel(){
    var currentTime = new Date().getTime();
    if (currentTime - levelTime > consts.LEVEL_INTERVAL){
        level += 1;
        interval = calcIntervalByLevel(level);
        views.setLevel(level);
        levelTime = currentTime;
    }
}

// Refresh game canvas
function _refresh() {
    if (!running){
        return;
    }
    currentTime = new Date().getTime();
    if (currentTime - prevTime > interval ){
        _update();
        prevTime = currentTime;
        _checkLevel();
    }
    if (!isGameOver){
        window.requestAnimationFrame(_refresh);
    }
}

// Update game data
function _update() {
    if (shape.canDown(matrix)){
        shape.goDown(matrix);
    }else{
        shape.copyTo(matrix);
        _check();
        _fireShape();
    }
    _draw();
    isGameOver = checkGameOver(matrix);
    if (isGameOver){
        views.setGameOver(isGameOver, false);
        views.setFinalScore(score);
        pause();
    }
}

// Draw game data
function _draw() {
    canvas.drawScene();
    canvas.drawShape(shape);
    canvas.drawMatrix(matrix);
}

// Fire a new random shape
function _fireShape() {
    shape = preparedShape||shapes.randomShape();
    preparedShape = shapes.randomShape();
    _draw();
    canvas.drawPreviewShape(preparedShape);
}

//Pause game
function pause() {
    running = false;
    currentTime = new Date().getTime();
    prevTime = currentTime;
}

// Restart game
function _restartHandler() {
    reset();
    toMainMenu();
}

//Reset game
function reset() {
    console.log("Game reset")
    running = false;
    isGameOver = false;
    level = 1;
    score = 0;
    startTime = new Date().getTime();
    currentTime = startTime;
    prevTime = startTime;
    levelTime = startTime;
    clearMatrix(matrix);
    views.setLevel(level);
    views.setScore(score);
    views.setGameOver(isGameOver);
    _fireShape();
    _draw();
}

// All key event handlers
function _keydownHandler(e) {
    if(!e) {
        let e = window.event;
    }

    if (!running||!shape){
        return;
    }

    switch(e.keyCode){
        case 37: {
            shape.goLeft(matrix);
            _draw();
        }
        break;

        case 39: {
            shape.goRight(matrix);
            _draw();
        }
        break;

        case 38: {
            shape.rotate(matrix);
            _draw();
        }
        break;

        case 40: {
            shape.goDown(matrix);
            _draw();
        }
        break;

        case 32: {
            shape.goBottom(matrix);
            _update();
        }
        break;
    }
}

// Bind game events
window.addEventListener('keydown', _keydownHandler, false);
views.btnRestart.addEventListener('click', _restartHandler, false);

document.getElementById("singleStart").addEventListener("click", startSinglePlayer, false);
document.getElementById("multiStart").addEventListener("click", searchForPlayers, false);
document.getElementById("returnMainMenu").addEventListener("click", toMainMenu, false);


let authId;

// Socket connection to server
socket.on('connect', () => {
    console.log('connected');

    socket.on('authStart', (serverId) => {
        if (!authId) {
            authId = serverId;
        }
        socket.emit('authEnd', authId)
    })
})
