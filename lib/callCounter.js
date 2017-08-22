/**
 * Measures call counts of functions calles
 */


var callCount = {}; 
var onlyMultiCount ={}; //Additional counter with only  

var currentFile="NOTDEFINED";

function switchFile(filename){
    currentFile = filename;
}


function countCalls(key){

    if(!callCount[currentFile]){
        callCount[currentFile] ={};
    }
    if(!callCount[currentFile][key]){ 
        callCount[currentFile][key]=1;
    }else{
        callCount[currentFile][key]=callCount[currentFile][key]+1;
        onlyMultiCount[currentFile+"KEY:"+key] = callCount[currentFile][key]+1;
        //debugger;
    }
}

function printCallcount(){
    console.log(callCount);
    console.log(onlyMultiCount);
}
 /**
  * Returns the call count of a specified key 
  * @param {string} 
  */
function getCurrentCount(key){
    return callCount[currentFile][key];
}
module.exports = {
    switchFile,
    countCalls,
    getCurrentCount,
    printCallcount
}