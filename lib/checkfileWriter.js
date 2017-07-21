const fs = require('fs');

const config = {
    checkfile_aufsichtsrat_enabled: true,
    checkfile_aufsichtsrat: "Checkfile_Aufsichtsrat.txt",
    checkfile_vorstand_enabled: true, 
    checkfile_vorstand: "Checkfile_Vorstand.txt", 
    checkfile_geschleitung_enabled: true, 
    checkfile_geschleitung: "Checkfile_Geschleitung.txt", 
    checkfile_organbezuege_enabled: true, 
    checkfile_organbezuege: "Checkfile_Organbezuege.txt", 
    checkfile_aktionaere_enabled: true, 
    checkfile_aktionaere: "Checkfile_Aktionaere.txt", 
    checkfile_investorRelations_enabled: true, 
    checkfile_investorRelations: "Checkfile_InvestorRelations.txt",
    checkfile_gesellschafter_enabled: false, 
    checkfile_gesellschafter: "Checkfile_Gesellschafter.txt", 
    checkfile_anteilseigner_enabled: true, 
    checkfile_anteilseigner: "Checkfile_Anteilseigner.txt",
    checkfile_beteiligungen_enabled: true, 
    checkfile_beteiligungen: "Checkfile_Beteiligungen.txt",
    checkfile_kapitalentwicklung_enabled: true, 
    checkfile_kapitalentwicklung: "Checkfile_Kapitalentwicklung.txt", 
    checkfile_grundkapital_enabled: true, 
    checkfile_grundkapital: "Checkfile_Grundkapital.txt", 
    checkfile_genehmkapital_enabled: true, 
    checkfile_genehmkapital: "Checkfile_GenehmigtesKapital.txt", 
    checkfile_bedingkapital_enabled: true, 
    checkfile_bedingkapital: "Checkfile_BedingtesKapital.txt" 

}


//Clear files at startup 
fs.writeFileSync(config.checkfile_aufsichtsrat,'');
fs.writeFileSync(config.checkfile_vorstand,'');
fs.writeFileSync(config.checkfile_geschleitung,'');
fs.writeFileSync(config.checkfile_organbezuege,'');
fs.writeFileSync(config.checkfile_aktionaere,'');
fs.writeFileSync(config.checkfile_investorRelations,'');
fs.writeFileSync(config.checkfile_gesellschafter,'');
fs.writeFileSync(config.checkfile_anteilseigner,'');
fs.writeFileSync(config.checkfile_beteiligungen,'');
fs.writeFileSync(config.checkfile_kapitalentwicklung,'');
fs.writeFileSync(config.checkfile_grundkapital,'');
fs.writeFileSync(config.checkfile_genehmkapital,'');
fs.writeFileSync(config.checkfile_bedingkapital,'');


/**
 * Writes content of a header line to a checkfile to indicate which file the following contents with 'writeToCheckfile' 
 * belong.
 * @param {string} header ---> usually the filename 
 * @param {string} filetowrite filepath to which the entry gets written 
 * @param {string} activated the logging is active 
 */
function writeHeaderToCheckFile(header,filetowrite,activated){
    if(!activated)return; 
    try{
        fs.appendFileSync(filetowrite,header + "\r\n");
    }catch(ex){
        console.log(" Exception ",ex);
    }
}
/**
 * Writes content of a certain line to a checkfile, also write the parsed content there, this is 
 * used for creating big checkfiles for validating parser functionality. 
 * @param {int} linenumber number of line related to the data of origin in the specified file 
 * @param {string} dataorigin datastring of the original data 
 * @param {object} dataparsed parsed interpreted data json-object 
 * @param {string} filetowrite filepath to which the entry gets written  
 * @param {boolean} activated the logging is active 
 */
function writeToCheckfile(linenumber,dataorigin,dataparsed,filetowrite,activated){
    if(!activated)return; 
    try{
        //fs.appendFileSync(filetowrite,"line of origin:" +linenumber+ "\r\n"); //t necessary most of the time
        fs.appendFileSync(filetowrite,"origin: "+dataorigin + " \r\n");
        fs.appendFileSync(filetowrite,"parsed "+dataparsed+ "\r\n "); 
    }catch(ex){
        console.log(" Exception ",ex);
    }
}  


module.exports = {
    config, 
    writeHeaderToCheckFile,
    writeToCheckfile
}