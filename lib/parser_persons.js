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
var parser_beteiligungen = require('./parser_aktionaer_eigner_beteiligungen'); 



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
            //var input = linesplit[currentIndex].replace(/\*\)/g,'').replace(titleInfo.titleDetected,'');
            
            var dsplitOne = titleInfo.dataWithoutTitle.split(',')[0];
            var input = dsplitOne.replace(/\*\)/g,'').replace(titleInfo.titleDetected,'');
            nameAndFunctInfo = detectNameAndFunct(input);
        }

        currentIndex = titleInfo.nextIndex;
    }else {
        try{
      
            //Index is t placed right atm....
            var lineToCheck;
            if(linesplit[titleInfo.nextIndex]){
                //debugger; //Just a test: Hubertus Matnhley fixed, other cases ok? 
                lineToCheck =  regexLib.removeLastComma(titleInfo.dataWithoutTitle).trim();
                
            }else{
                lineToCheck =  regexLib.removeLastComma(titleInfo.dataWithoutTitle).trim();
            }
            
            nameAndFunctInfo = detectNameAndFunct(lineToCheck.replace(/\*\)/g,''));
            if(nameAndFunctInfo.nextIndex){
                currentIndex = nameAndFunctInfo.nextIndex;
            }else{
                currentIndex = titleInfo.nextIndex; 
            }
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
    var funct = functLastLineInfo.isTitle? functLastLineInfo.titleFound.trim() : nameAndFunctInfo.detectedFunct.trim(); //If function is in the lastline take it from there otherwise from brackets 
    
    //Replace empty brackets in in city recognized 
    if(cityAcc){
        cityAcc = cityAcc.replace(funct,"");
        cityAcc = cityAcc.replace(/\(/g,"").replace(/\)/g,"").trim();        
    }
 
    var title = titleInfo.titleDetected.trim(); 
    var firstName = nameAndFunctInfo.firstname.trim(); 
    var lastName = nameAndFunctInfo.lastname.trim(); 
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
        
        if(data.indexOf("Christoph")!=-1){
            console.log("You win a price! ");
        }

        //Remove double spaces 
        var spaceRefactoredName =  returbj.detectedName.replace("  "," ");
        //Split name in first and lastname 
        var namesplit = spaceRefactoredName.trim().split(' ');
        if(namesplit.length<=2){
            var lastname = namesplit[namesplit.length-1]; //Just take the last element
            var firstname = returbj.detectedName.replace(lastname,""); 
            returbj.lastname = lastname; 
            returbj.firstname = firstname; 
        }else{
            var lastname="";
            for(var x=1;x<namesplit.length;x++){
                lastname = lastname+" "+namesplit[x].trim();
            }
            returbj.lastname = lastname.trim();//regexLib.removeLastComma(namesplit[1]); //Just take the last element
            returbj.firstname =  regexLib.removeLastComma(namesplit[0]);
            returbj.nextIndex = 2; //Addtional nextindex
        }

        if(returbj==null)debugger; //TODO CHECK IF ENTRIE ARE NOW OK 
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

function parse_gesellschafter(gesellschafterItems,originline){
    var returnObject={}; 
    var currentMode="";

    function gesellschafterItem(){
        this.name;
        this.ort;
    }
    function kommanditistenItem(){
        this.name;
        this.ort;
        this.anteil;
    }

    const CURRENTMODE = {
        GESELLSCHAFTER: "Gesellschafter",
        KOMMANDITISTEN: "Kommanditisten",
        AKTIONAERE:     "Aktionaere",
        ANTEILSEIGNER: "Anteilseigner"
    }
    

    for(var i=0;i<gesellschafterItems.length;i++){
        var currentItem = gesellschafterItems[i];
        var currentItemText = utils.htmlText2Text(currentItem);

        if(currentItem.indexOf("Gesellschafter:<")!=-1){
            currentMode = CURRENTMODE.GESELLSCHAFTER;
        }else if(currentItem.indexOf(">Kommanditist")!=-1){
            currentMode =  CURRENTMODE.KOMMANDITISTEN;
        }else if(currentItem.indexOf("b>Aktion")!=-1){
            currentMode = CURRENTMODE.AKTIONAERE;
        }else if(currentItem.indexOf(">Anteilseigner")!=-1){
            currentMode = CURRENTMODE.ANTEILSEIGNER;
        }else{
            //Parse Gesellschafter 
            switch (currentMode) {
                case CURRENTMODE.GESELLSCHAFTER:
                    var plineres = checkPersonLine(currentItemText,-1,false,"");
                    if(!returnObject.gesellschafter)returnObject.gesellschafter = [];
                    returnObject.gesellschafter.push(plineres);
                    break;
                case CURRENTMODE.KOMMANDITISTEN:
                    var komanditRes = parser_beteiligungen.beteiligungen_parseLine(currentItemText);
                    if(!returnObject.kommanditisten)returnObject.kommanditisten = [];
                    returnObject.kommanditisten.push(komanditRes);
                    break;
                case CURRENTMODE.AKTIONAERE:
                    var aktionaerRes = parser_beteiligungen.beteiligungen_parseLine(currentItemText);
                    if(!returnObject.aktionaere)returnObject.aktionaere = [];
                    returnObject.aktionaere.push(aktionaerRes);
                    break;
                case CURRENTMODE.ANTEILSEIGNER:
                    var anteilseignerRes = parser_beteiligungen.beteiligungen_parseLine(currentItemText);
                    if(!returnObject.anteilseigner)returnObject.anteilseigner = [];
                    returnObject.anteilseigner.push(anteilseignerRes);
                    break;
                default:
                    //A rest which is undefined at the moment
                    debugger;
                    break;
            }
        }

    }
    return returnObject;    
}    

function parse_leiter(leiterLines){
    var returnObject={
        leiter: []
    };

    function leiterItem(){
        this.firstname;
        this.lastname;
        this.title;
        this.funct;
        this.city;
        this.fax;
        this.email;
        this.phone;
    }
    for(var i=0;i<leiterLines.length;i++){
        var currentline = leiterLines[i];
        var currentlineChanged = currentline; 
        var currentLeiterItem = new leiterItem();
        var tel = regexLib.matchFromStringToString(currentline,"Telefon:","<br>|;",true);
        var fax = regexLib.matchFromStringToString(currentline,"Fax:","<br>|;",true);
        var email = regexLib.matchFromStringToString(currentline,"Email:","<br>|;",true);
        if(tel && tel[0] && tel[1]){
            currentlineChanged = currentlineChanged.replace(tel[0],"");
            currentLeiterItem.phone = tel[1];
        }
        if(fax && fax[0] && fax[1]){
            currentlineChanged = currentlineChanged.replace(fax[0],"");
            currentLeiterItem.fax = fax[1];
        }
        if(email && email[0] && email[1]){
            currentlineChanged = currentlineChanged.replace(email[0],"");
            currentLeiterItem.email = email[1];
        }
        //Remove functioning html 
        currentlineChanged = utils.htmlText2Text(currentlineChanged);
        //Remove html fragments 
        currentlineChanged = currentlineChanged.replace("br>","").trim();
        var persResult = checkPersonLine(currentlineChanged,currentline,false,"");
        if(persResult){
            if(persResult.title){
                currentLeiterItem.title = persResult.title.trim();
            }
            if(persResult.firstName){
                currentLeiterItem.firstname = persResult.firstName.trim();
            }
            if(persResult.lastName){
                currentLeiterItem.lastname = persResult.lastName.trim();
            }
            if(persResult.cityAcc){
                currentLeiterItem.city = persResult.cityAcc.trim();
            }
            if(persResult.funct){
                currentLeiterItem.funct = persResult.funct.trim();
            }
        }
        var finalLeiterItem = utils.removeEmptyEntriesFromObject(currentLeiterItem);
        if(!utils.isObjectEmpty(finalLeiterItem)){
            returnObject.leiter.push(finalLeiterItem);
        }
    }
    return returnObject;
}
module.exports = {
    checkPersonLine,
    parseVorstand,
    parse_investorRelations,
    parse_gesellschafter,
    parse_leiter,
    detectNameAndFunct
}