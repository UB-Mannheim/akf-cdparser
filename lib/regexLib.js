

/**
 *  Match a number with percentage sign between parenthesis in the given language
 *  Matches examples:
 *  (12,11%)
 *  (12%)
 *  (12,1%)
 *  (1%)
 * @param {string} line line for the matching 
 * @returns {array} matches occured
 */
function matchPercentage(line){
    var percentagematch = line.match(/(\d+(?:,\d+)?)(\s*%)/g);
    return percentagematch;
}

/**
 * Checks if a given string is contained in parenthesis, if yes returns the string and content in parenthesis 
 * around the string
 *  
 * Matches examples (given data:"drizzle")
 * (drizzle) --> (drizzle)
 * (today the weather is drizzle) --> (drizzle)
 * (drizzle machine)(otherstuff) ---> (drizzle machine)
 * @param {string} data string which is checked if it's in parenthesis
 * @param {string} line line which contains the actual content
 * @returns content around the string 
 */
function checkIfStringIsInParenthesis(data,line){
    var numberIsInFilledBrackets = "\\([^\)]+"+data+"[^\(]+\\)|\\([^\)]*"+data+"[^\(]+\\)|\\([^\)]+"+data+"[^\(]*\\)";
    var numberIsInFilledBracketsEx = new RegExp( numberIsInFilledBrackets);
    var infillmatch = line.match(numberIsInFilledBracketsEx);
    return infillmatch; 
}









module.exports = {
    matchPercentage,
    checkIfStringIsInParenthesis
}