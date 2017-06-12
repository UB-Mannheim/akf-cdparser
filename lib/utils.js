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

/**
 * Replaces all occurences of ';'-character and ';'-character WITHIN brackets '()' in the given string with ' ' 
 * @param {string} inputString input data which can have brackets i.e. "This, is (bracketcontent;semicolon);other stuff (bracketcontent)"
 * @returns {string} corrected input string without brackets 
 **/
function replaceSemicolonAndCommaInBrackets(inputString){
    var bracketsList = inputString.match(/\((.*?)\)/g);
    if(bracketsList==null) return inputString; 
    
    for(var x=0;x<bracketsList.length;x++){
        var inBrackets = bracketsList[x];
        if(inBrackets && (inBrackets.indexOf(';')!=-1||inBrackets.indexOf(',')!=-1)){
            var newInBrackets = inBrackets.replace(/;/g,' ');
            newInBrackets = newInBrackets.replace(/,/g,' ');
            inputString = inputString.replace(inBrackets,newInBrackets); //Replace ; within brackets with whitespace 
        }
    }
    return inputString; 
}


module.exports = {
    cleanText,
    leafNodes,
    replaceSemicolonAndCommaInBrackets
}
