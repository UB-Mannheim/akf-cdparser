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

module.exports = {
    cleanText,
    leafNodes,
    removeEmptyEntriesFromArray,
    isObjectEmpty,
    htmlText2Text,
    doesArrayContainString
}
