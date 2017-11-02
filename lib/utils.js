/**
 * utils.js 
 * Utility functions. Mostly for string and object editing.
 */
var cheerio             = require('cheerio'); 

/**
 * Replaces some special characters and tabbls in a string and casts string to lowercase 
 * @param {string} literal - string to edit
 * @returns {string} edited string
 */
function cleanText(literal) {
    return (''+literal).toLowerCase().replace(/[\s\n\t,;\(\):\.-]+/g, ' ');
}

/**
 * Creates a string made of the value in 'char' repeated the number of
 * assigned in 'number'
 * @param {string} char  
 * @param {integer} number 
 */
function createSeriesOfCharacter(char,number){
    var series="";
    for(var i=0;i<number;i++){
        series = series + char; 
    }
    return series; 
}

/**
 * Removes the last characters in the string if they match the
 * lastcharacters string 
 * @param {string} line  string to check if it has certain last characters 
 * @param {string} lastcharacters 
 * @returns {object} contains result and changed flag if something was removed
 */
function removeLastCharacters(line,lastcharacters){
     var returnObject = {
        line: line,
        removed: false
    }
    if(!lastcharacters)return returnObject;
    if(!line)return returnObject; 
    

    if(line.endsWith(lastcharacters)){
        line = line.substring(0,line.length-lastcharacters.length).trim();
        returnObject.line = line; 
        returnObject.removed = true; 
    }
    return returnObject; 
}
/**
 * Returns all leaf nodes of an array of array, recursively calls itself
 * @param {object} obj - array of elements which can contain sub elements
 * @param {array} ret - array which contains all leafNodes 
 */
function leafNodes(obj, ret=[]) {
    if (Array.isArray(obj)) {
        obj.forEach(el => leafNodes(el, ret))
    } else if (typeof obj === 'object') {
        Object.keys(obj).forEach(k => leafNodes(obj[k], ret))
    } else {
        ret.push(obj)
    }
    return ret
}

/**
 * Check if an array element contains a certain string
 * @param {array} array - array to check upon
 * @param {string} needle - string which is searched in array
 * @returns {boolean} - true if string was found, otherwise false
 */
function doesArrayContainString(array,needle){
   for (i in array) {
      if (array[i].indexOf && array[i].indexOf(needle)!=-1) return true;
   }
   return false;
}

/**
 * Removes all entries from an array which are not defined, or which are an empty
 * object.
 * @param {array} dataArray - array to clean up
 * @returns {array} array with removed empty entries
 */
function removeEmptyEntriesFromArray(dataArray){
    if(!dataArray.filter)debugger;
    var returnArray = dataArray.filter(
        function(n){ 
            if(n==="") return false; 
            else if(!n) return false;
            else if(isObjectEmpty(n)) return false; 
            else return true; 
        }
    ); 
    return returnArray;
}
/**
 * Remove an array of strings from a defined string. 
 * When removing, always the first occurence in the line is replaced.
 * The array of strings is ordered by length, the longest string is subtracted first.
 * @param {string} line - this is the string which is edited 
 * @param {array} arrayOfStrings - each element of this array is subtracted from the line
 * @returns {string} edited line 
 */
function removeStringsFromString(line,arrayOfStrings){
    if(!line) return line;
    if(!arrayOfStrings ||arrayOfStrings.length==0) return line; 
    var changedLine = line;
    
    //Order arrayofstrings by length
    arrayOfStrings.sort(function(a, b){
        // DESC -> b.length - a.length
        blength = b ? b.length : 0;
        alength = a ? a.length : 0;
        return blength-alength;
    });

    //Replace the array content from the line
    for(var i=0;i<arrayOfStrings.length;i++){
        changedLine = changedLine.replace(arrayOfStrings[i],"");
    }
    return changedLine;
}

/**
 * Get the content which is in (all) parenthesis in the input string
 * @param {string} line - line to look for parenthesis
 * @param {boolean} fillParenthesis (optional) - if there are more opening than closing parenthesis, use these to fill
 * @returns {string} content which is in parenthesis
 */
function getParenthesisContent(line,fillParenthesis=false){
    if(!line)return "";
    var characters = line.split(''); 
    var parenthesisContent ="";
    var pushedContent = [];
    var openParenthCount = 0; 
    var closingParenthCount = 0; 

    //Get content in parenthesis 
    for(var i=0;i<characters.length;i++){
        var currentChar = characters[i];
        if(currentChar==="(") openParenthCount = openParenthCount +1; 
        if(currentChar===")"){ 
            closingParenthCount = closingParenthCount +1;
            if(closingParenthCount==openParenthCount){
                //This sets an end ')' -> end of a parenthesis tree 
                parenthesisContent = parenthesisContent + currentChar;
                
                //Push the collected content to array 
                pushedContent.push(parenthesisContent);
                parenthesisContent ="";
                openParenthCount = 0;
                closingParenthCount = 0;
                
            }
        }
        if(openParenthCount > closingParenthCount){
            parenthesisContent = parenthesisContent + currentChar;
        }           
    }
    
    //Fix malformed entries (just add parenthesis in the end)
    if(fillParenthesis && parenthesisContent && (openParenthCount>closingParenthCount)){
        var diff = openParenthCount-closingParenthCount;
        var parenthToAdd ="";
        for(var i=0;i<diff;i++){
            parenthToAdd = parenthToAdd +")";
        }
        //Create a new line with forged end-paranthesis
        var newLine = line+parenthToAdd;
        //Check the parenthesis usage for this line
        pushedContent = getParenthesisContent(newLine);
    }
    return pushedContent;
}
/**
 * Get all keys in a javascript object which have a certain defined value
 * @param {object} item - a javascript object with key value pairs 
 * @param {string/boolean/integer} value - the value the javascript object has  
 */
function getKeysByValue(item,value){
    var foundKeys = [];

    for(var prop in item) {
        if(item.hasOwnProperty( prop )) {
            if(item[prop] === value){
                foundKeys.push(prop);                
            }
        }
    }
    return foundKeys;
}

/**
 * Check if an object is empty 
 * @param {object} obj - javascript object to check upon
 * @returns {boolean}  - if empty or undefined true, otherwise false 
 */
function isObjectEmpty(obj) {
    for(var prop in obj) {
        if(obj.hasOwnProperty(prop))
            return false;
    }

    return true;
}
/**
 * Reads in a html text string and gives back a text only string
 * the same thing the cheeriotableparser does with 'textMode'-configuration 
 * activated 
 * @param   {string} htmlText 
 * @returns {string} text as non html readable text
 */
function htmlText2Text(htmlText){
    var  $ = cheerio.load(htmlText);
    var text = $.text();
    return text;
}

/**
 * Iterates through the entries of a javscript object and deletes the entries
 * which have a value of undefined or null
 * @param {object} obj - javascript object to check upon
 * @returns {object} - the modified object
 */
function removeEmptyEntriesFromObject(obj) {
    var propNames = Object.getOwnPropertyNames(obj);
    for (var i = 0; i < propNames.length; i++) {
      var propName = propNames[i];
      if (obj[propName] === null || obj[propName] === undefined) {
        delete obj[propName];
      }
    }
    return obj;
}

module.exports = {
    cleanText,
    leafNodes,
    removeEmptyEntriesFromArray,
    removeEmptyEntriesFromObject,
    createSeriesOfCharacter,
    removeLastCharacters,
    isObjectEmpty,
    htmlText2Text,
    doesArrayContainString,
    getKeysByValue,
    getParenthesisContent,
    removeStringsFromString
}
