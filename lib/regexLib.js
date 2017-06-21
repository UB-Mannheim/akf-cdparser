

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

/**
 * Matches a part of the given data which starts with 'from' and ends with 'to'  
 * @param {string} data given data 
 * @param {string} from  left side delimiter, can be regex (care to properly escape special characters) 
 * @param {string} to    right side delimiter , can be regex (care to properly escape special characters) ATM ONLY 1 character length delimiters work 
 * @returns null if no match or array with index 0: occurence with delimeters, index 1: occurence without delimeters
 * 
 * Example: 
 * from "Tel.:", to ","
 * data "Tel.: (08241) 5 03-2 58,"
 * returns (08241) 5 03-2 58
 * 
 */
function matchFromStringToString(data,from,to,ignoreCase=true){
    //var matchFromTo = "\(?:"+from+"\)\(.*?\)\(?:"+to+"\)";    //this didn't work because sometimes it took the righthanded delimiter for 'to' 

    var matchWithFromAndTo; 
    var dataUsed = data; 

    var fromEx = new RegExp(from);
    fromEx.ignoreCase  = ignoreCase;
    var indexFrom = data.search(fromEx);
    if(indexFrom!=-1){
        dataUsed = data.substring(indexFrom);
    }else{
        return null; //No from occurence found 
    }

    var toEx = new RegExp(to);
    toEx.ignoreCase = ignoreCase; 
    var indexTo = dataUsed.search(toEx);  
    if(indexTo!=-1){
        matchWithFromAndTo = dataUsed.substring(0,indexTo+1);        
        dataUsed = dataUsed.substring(0,indexTo); 
    }

    var dataWithoutFromAndTo = dataUsed.replace(fromEx,'').trim(); //Replace the occurence of from data and trim

    var returnArray = [matchWithFromAndTo,dataWithoutFromAndTo];
    return returnArray;
}



function removeLastComma(data){
    var returndata = data.replace(/,\s*$/, "");
    return returndata;
}

module.exports = {
    matchPercentage,
    removeLastComma,
    checkIfStringIsInParenthesis,
    matchFromStringToString
}