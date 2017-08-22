/**
 * Parser functions for person related content, matches with 
 * 'Aufsichtsrat'
 * 'Geschäftsleitung' 
 * 'Vorstand'
 */
var utils             = require('./utils');
var cfw               = require('./checkfileWriter');
var dictionaryHandler = require('./dictionaryHandler'); //does it work
var regexLib          = require('./regexLib');



/**
 * Check a person-related string for contents (Title,Name,Function,City etc), detect these contents and put them in the 
 * return object in a classificated manner. 
 * @param {string} _  line containing a person related string (i.e from 'Vorstand', 'Aufsichtsrat' or 'Geschäftsführung')
 * @param {int} originline starting index of the contents related to '_' 
 * @param {boolean} commonfunct_isThere  indicator if there was a common 'function' detected somewhere in this content
 * @param {string} commonfunct the common 'function' which was recognized (i.e. 'Arbeitnehmervertreter')
 * @returns {object} an object containing all the classified data 
 */
function checkPersonLine(_,originline,commonfunct_isThere,commonfunct){
    
    var bemerkung; 
    //Remove the '(persönlich haftend)' tag from line for further processing, add it as bemerkung for the returned manager object 
    var persHaftend = new RegExp(/\(persönlich haftend\)/gi); 
    var persHaftendMatch = _.match(persHaftend);
    if(persHaftendMatch!=null && persHaftendMatch.length>=1){
        _ = _.replace(persHaftend,'');
        bemerkung= persHaftendMatch[0];
    }
    
    //Remove the (x Mitglieder) lines TODO: Think about if this can be added to the database later 
    var xMitglieder = new RegExp(/\([\d]+ Mitglieder\)/gi); 
    var xMitgliederMatch = _.match(xMitglieder);
    if(xMitgliederMatch!=null && xMitgliederMatch.length>=1){
        _ = _.replace(xMitglieder,'');
    }

   
    //Split and parse the line _
    var linesplit = _.split(',');           //comma seperated line 
    var nameStartIndex=-1; 
    var currentIndex =-1;                       
    var nameAndFunctInfo;                   //object for storing detected name and funct 
    var titleInfo;                          //object for storing detected title


    //Title detection 
    var matchingOption ="normal";           //'rmal' or 'ldist' is possible 
    titleInfo = dictionaryHandler.checkIfTitleIsInArray(linesplit,',',matchingOption);  
    //Name and Funct detection 
    var functLastLineInfo = dictionaryHandler.checkIfaFunctContentIsInString(linesplit[linesplit.length-1]); 
    if(functLastLineInfo.isTitle){  //If the title was recognized in lastline delete it to t confuse further processing 
        if(!functLastLineInfo.hasRest || functLastLineInfo.dataWithoutTitle.trim().length==0){ //if there is  rest or the rest are just spaces ... 
            linesplit =  linesplit.splice(0, linesplit.length-1);
        }
        if(functLastLineInfo.hasRest){
            linesplit[linesplit.length-1] = functLastLineInfo.dataWithoutTitle.trim();
        }
    }
    if(!titleInfo.hasName && !titleInfo.hasTitle){
        currentIndex=0; //Proceed with the first element for name detection 
        if(!linesplit[currentIndex]){
            nameAndFunctInfo = detectNameAndFunct(""); 
        }else{
            nameAndFunctInfo = detectNameAndFunct(linesplit[currentIndex].replace(/\*\)/g,'')); 
        }
        currentIndex = currentIndex+1; 
    }
    else if(titleInfo.hasName){
        if(!titleInfo.hasTitle){
            nameAndFunctInfo = detectNameAndFunct(titleInfo.nameDetected.replace(/\*\)/g,'')); //why was this here`?
        }else{
            currentIndex = 0; 
            nameAndFunctInfo = detectNameAndFunct(
                  linesplit[currentIndex].replace(/\*\)/g,'').replace(titleInfo.titleDetected,''));
        }


        currentIndex = titleInfo.nextIndex;
    }else {
        try{

            //Index is t placed right atm....
            var lineToCheck = linesplit[titleInfo.nextIndex];

            nameAndFunctInfo = detectNameAndFunct(lineToCheck.replace(/\*\)/g,''));
            currentIndex = titleInfo.nextIndex; 
        }catch(ex){
            console.log("Exception at line ",originline," with string ",_);
        }
    }

    //City detection (also for special cases funct is already detected) 
    var funct =""; 
    var cityAcc=""; 
    for(var i=currentIndex;i<linesplit.length;i++){
        try{
            var lineToApply = linesplit[i]; 

            if(linesplit[i].match(/\*\)/g)){
                //This is a specific case which contains actually the function 
                lineToApply = lineToApply.split("*)")[0].trim();
            }
            //JS this is temporary to see if there are more entries then 3 for the city
            if(cityAcc===""){
                cityAcc = lineToApply.trim();
            }else{
                cityAcc = cityAcc +" ("+lineToApply.trim()+")";  
            }
        }catch(ex){
            console.log(" Exception ",ex);
        }
    }

    if(!nameAndFunctInfo){
        console.log(" Something wrong shouldn't happen")
    }

    
    var title = titleInfo.titleDetected; 
    var firstName = nameAndFunctInfo.firstname; 
    var lastName = nameAndFunctInfo.lastname; 
    var funct = functLastLineInfo.isTitle? functLastLineInfo.titleFound : nameAndFunctInfo.detectedFunct; //If function is in the lastline take it from there otherwise from brackets 
    if(commonfunct_isThere){ //A common funct can be there for a set of multiple lines, but for the specific lines it needs to be matched again
        if(_.indexOf('*)')!=-1){
            cityAcc = cityAcc.replace('*)','');
            if(funct.trim()!==commonfunct.trim()){ //Without this there could be double 'Arbeitnehmervertreter' i.e. in the final funct
                funct +=" "+ commonfunct;
                funct = funct.trim();    
            }
        }       
    }

    //Creating Manager object
    const manager = {title, firstName, lastName, cityAcc, funct,bemerkung}; 
    for (let k in manager) if (!manager[k]) delete manager[k]

    return manager; 
}

/**
 * Parse content related to 'Vorstand' 
 * @param {string} vorstand semicolon seperated line with vorstand 
 * @param {int} originline index of original line related to this entry, mainly used for logging 
 * @param {int} i index of the last line related to this entry, for return value for next entry
 * @param {object} ret object for parsing-json files, results of the parsing gets added to this object 
 */
function parseVorstand(vorstand,originline,i,ret){
    var vorstaende = []; 
    vorstand = regexLib.replaceSemicolonAndCommaInBrackets(vorstand); 

    vorstand.split(/\s*;\s*/).trimAll().forEach(_ => {              //Split all entries between semicolon and trim

        /* 
        if(_.indexOf("Klaus-Dieter Peters")!=-1){
            console.log(" Next line should be added also they seem interconnected  ; in the function brackets should split the whole string ");
        }
        */
        var manager = checkPersonLine(_,originline);
        cfw.writeToCheckfile(originline,_,JSON.stringify(manager), cfw.config.checkfile_vorstand ,cfw.config.checkfile_vorstand_enabled);                                        
        vorstaende.push(manager);
    })
    return vorstaende; 
}


/**
 * Detect First Name and Lastname from given name and also the function which is in '()'  
 * @param {string} data: An example input string looks like this: Jane Vaine (Vors.) 
 * @returns {object} which contains the detected name and function and indicators if these properties could be found 
 **/ 
function detectNameAndFunct(data){
    
    var returbj = {
        detectedName:"", 
        hasName: false,
        detectedFunct:"",
        hasFunct: false,
        firstname:"",
        lastname:""
    }

    
    try{

        //Check if funct is in ()      
        var returnmatch = data.match(/\((.*?)\)/);
        
        if(returnmatch!=null){
            returbj.hasFunct = true; 
            returbj.detectedFunct = returnmatch[1];
            returbj.hasName = true; 
            returbj.detectedName =  data.replace(returnmatch[0],"").trim(); 
        }else{
            returbj.hasName = true; 
            returbj.detectedName = data;
        }
        
        if(data.indexOf("Bruce J. Jones")!=-1){
            console.log("You win a price! ");
        }
        
        //Split name in first and lastname 
        var namesplit = returbj.detectedName.trim().split(' ');
        var lastname = namesplit[namesplit.length-1]; //Just take the last element
        var firstname = returbj.detectedName.replace(lastname,""); 
        returbj.lastname = lastname; 
        returbj.firstname = firstname; 

        return returbj;

    }catch(ex){
        console.error("Problem detecting name and funct for ",data," exception ",ex); 
        return null;   
    }
}


/**
 * Parse content which contains one or multiple investor relations  
 * @param {array} investorRelLines array of strings which contains the investor Relations field content 
 * @param {int} originline index of original line related to this entry, mainly used for logging  
 * @param {int} i index of the last line related to this entry, for return value for next entry 
 * @param {object} ret object for parsing-json files, results of the parsing gets added to this object 
 * 
 * This is how a investorRel-line can look
 * Name Telefon:XXXXX; Fax:XXXXXXX
 * Name (Function)
 * Name, Tel.: XXXXXX, Fax: XXXXXXX (Function)
 * 
 */
function parse_investorRelations(investorRelLines,originline,y,ret){
    var returnObject = [];
    var restOfLines = []; //This represents the rest of lines which sometimes occur 
    for(var i=0;i<investorRelLines.length;i++){
        var name=""; 
        var telefon=""; 
        var fax=""; 
        var funct="";
        var email="";
        
        /*
        if(investorRelLines[i].indexOf("Gudrun König")!=-1){
            console.log(" email field is ingored ");
        }
        */
        
        //Detect and Remove Function 
        var functInfo = dictionaryHandler.checkIfaFunctContentIsInString(investorRelLines[i]); 
        var dataToCheck = functInfo.isTitle?functInfo.dataWithoutTitle:investorRelLines[i];
        //Susanne Katschmareck, Tel.: (02331) 4 61-10 12, Fax: (02331) 4 61-10 19 (e-Mail: s.katschmareck@nordwest.com); Melanie Tchorz, Tel.: (02331) 4 61-13 06, Fax: (02331) 4 61-13 49 (e-Mail: m.tchorz@nordwest.com)<br>
        funct = functInfo.isTitle?functInfo.titleFound:"";
       

        //Detect email 
        var emailmatch = regexLib.matchFromStringToString(dataToCheck,"E-Mail:|E-Mail :|Email:|Email :|E-Mai",",|;|$");
        if(emailmatch!=null && emailmatch.length>=2){
            email = emailmatch[1].trim().replace('(|)',''); //assign email to endresult
            dataToCheck = dataToCheck.replace(emailmatch[0],' '); //Make data to check smaller //This needs to be double for some unkown buggy reason (Check in future)
            dataToCheck = dataToCheck.replace(emailmatch[0],' '); //Make data to check smaller 
        }
       
        //Detect Telefon 
        var telefonmatch = regexLib.matchFromStringToString(dataToCheck,"Tel\..*:|Telefon:|Telefon :",",|;");
        if(telefonmatch!=null && telefonmatch.length>=2){
            telefon = telefonmatch[1].trim(); //assign telefon to endresult
            dataToCheck = dataToCheck.replace(telefonmatch[0],' '); //Make data to check smaller 
        }

        //Detect Fax 
        var faxmatch = regexLib.matchFromStringToString(dataToCheck,"Fax:|Fax :",",|;|$");
        if(faxmatch!=null && faxmatch.length>=2){
            fax = faxmatch[1].trim(); //assign fax to endresult
            dataToCheck = dataToCheck.replace(faxmatch[0],' '); 
        }
        
        //Detect Name (is Rest then)
        name = dataToCheck.split(/\s{2,}/)[0].trim(); //At least to whitespace for splitting here 
        var dataToCheckRest =dataToCheck.replace(name,'').trim();
        if(dataToCheckRest.length>=1){
            console.log("further investigate this, some items we're not eaten");
            restOfLines.push(dataToCheckRest);
        }

        const manager = {name,email, telefon, fax,funct}; 
        for (let k in manager) if (!manager[k]) delete manager[k];
        cfw.writeToCheckfile(originline,investorRelLines[i],JSON.stringify(manager), cfw.config.checkfile_investorRelations ,cfw.config.checkfile_investorRelations_enabled);                                        
        if(!utils.isObjectEmpty(manager)){
            returnObject.push(manager);
        }      
    }
    return {restOfLines,returnObject}; 
}



module.exports = {
    checkPersonLine,
    parseVorstand,
    parse_investorRelations,
    detectNameAndFunct
}