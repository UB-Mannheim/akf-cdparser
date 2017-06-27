

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
 *  Match a number which can have comma seperated decimals
 *  Matches examples:
 *  12,11
 *  12
 *  12,1
 *  1
 * @param {string} line line for the matching 
 * @returns {array} matches occured
 */
function matchNumber(line){
    var numbermatch = line.match(/\d+(?:,\d+)?/g);
    return numbermatch;
}



/**
 * Searches all number occurences in a string, 
 * if the number contains a comma delimeter between decimals 
 * replace that delimeter by the replacement char, which is the . 
 * character by default 
 * @param {string} line string which contains the content to replace  
 * @param {string} replacementChar character which is used for replacement
 * @returns modified line 
 */
function replaceCommaInNumber(line,replacementChar='.'){
    var numberMatch = matchNumber(line); 
    for(var z=0;z<numberMatch.length;z++){
        var currentNm = numberMatch[z];
        if(currentNm.indexOf(',')!=-1){
            var newCurrentNm = currentNm.replace(',','.');
            line = line.replace(currentNm,newCurrentNm);
        }
    }
    return line;
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
    matchFromStringToString,
    matchNumber,
    replaceCommaInNumber,
    replaceSemicolonAndCommaInBrackets
}