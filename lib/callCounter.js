/**
 * callCounter.js
 * Module for Error Analysis. Measures call counts of function-calls
 */


var callCount = {};     //Counter object with the structure - filekey: functionname: numberofcalls   
var onlyMultiCount ={}; //Additional counter, which only contains functions with more than one call

//Module-scope variable which identifies the current file which the calls are counted in 
var currentFile="NOTDEFINED";

/**
 * Change the current file
 * @param {string} filename - filename of the new current file
 */
function switchFile(filename){
    currentFile = filename;
}

/**
 * This is the base counter functionality. The defined function gets counted up one time if this
 * is called. 
 * @param {string} key - defines the name of the called function
 */
function countCalls(key){

    if(!callCount[currentFile]){
        callCount[currentFile] ={};
    }
    if(!callCount[currentFile][key]){ 
        callCount[currentFile][key]=1;
    }else{
        //If counter bigger than 1, increment and also increment the multiCount object
        callCount[currentFile][key]=callCount[currentFile][key]+1;
        onlyMultiCount[currentFile+"KEY:"+key] = callCount[currentFile][key]+1;
        //debugger;
    }
}
/**
 * Prints the callcount objects to the console
 */
function printCallcount(){
    console.log("Callcount is: ",callCount);
    console.log("Multicallcount is: ",onlyMultiCount);
}

 /**
  * Returns the call count of a specified key in the current specified file
  * @param {string} key - function name of the count to get
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