var cheerio             = require('cheerio'); 

function cleanText(literal) {
    return (''+literal).toLowerCase().replace(/[\s\n\t,;\(\):\.-]+/g, ' ')
    // return (''+literal).replace(/[\s\n\t]/g, '')
}

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

function doesArrayContainString(array,needle){
   for (i in array) {
      if (array[i].indexOf && array[i].indexOf(needle)!=-1) return true;
   }
   return false;
}

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

function removeStringsFromString(line,arrayOfStrings){
    if(!line) return line;
    if(!arrayOfStrings ||arrayOfStrings.length==0) return line; 
    var changedLine = line;
    
    arrayOfStrings.sort(function(a, b){
        // DESC -> b.length - a.length
        blength = b ? b.length : 0;
        alength = a ? a.length : 0;
        return blength-alength;
    });

    //Order arrayofstrings by lenght 
    for(var i=0;i<arrayOfStrings.length;i++){
        changedLine = changedLine.replace(arrayOfStrings[i],"");
    }
    return changedLine;
}

function getParenthesisContent(line,fillParenthesis=false){
    if(!line)return "";
    var characters = line.split(''); 
    var parenthesisContent ="";
    var pushedContent = [];
    var openParenthCount = 0; 
    var closingParenthCount = 0; 

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
    isObjectEmpty,
    htmlText2Text,
    doesArrayContainString,
    getKeysByValue,
    getParenthesisContent,
    removeStringsFromString
}
