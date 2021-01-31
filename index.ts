import { promises, Stats } from "fs";
import prompt from "prompt";
import path from "path";
import { config } from "dotenv";
import dayjs, { Dayjs } from "dayjs";
import chalk from "chalk";
import { exit } from "process";

config();

enum SaveFileTypes {
  xbox = "xbox",
  steam = "steam",
}
type FileInfo = {
  basename: string;
  dirname: string;
};

type KeepRemove = {
  keep: SaveFileTypes;
  remove: SaveFileTypes;
};

interface SaveFileDetails {
  [SaveFileTypes.steam]: FileInfo;
  [SaveFileTypes.xbox]: FileInfo;
}
const SaveFileLocations = {
  [SaveFileTypes.xbox]: process.env.XBOX_DEEP_ROCK_DIR,
  [SaveFileTypes.steam]: process.env.STEAM_DEEP_ROCK_DIR,
};

const SaveFileDetails: SaveFileDetails = {
  xbox: {
    basename: path.basename(SaveFileLocations[SaveFileTypes.xbox]),
    dirname: path.dirname(SaveFileLocations[SaveFileTypes.xbox]),
  },
  steam: {
    basename: path.basename(SaveFileLocations[SaveFileTypes.steam]),
    dirname: path.dirname(SaveFileLocations[SaveFileTypes.steam]),
  },
};

const isDryRun = process.env.DRY_RUN === "true";

const property = {
  name: "yesno",
  message: chalk.yellow("Would you like to continue?"),
  validator: /y[es]*|n[o]?/,
  warning: "Must respond yes or no",
  default: "no",
};

const getEditTime = (stat: Stats): Dayjs => {
  return dayjs(stat.mtime);
};

/**
 * Function to get the save location to preserve and the one to remove.
 * @param xboxEditTime Last Edit Time for the Xbox Save File
 * @param steamEditTime Last Edit Time for the Steam Save File
 */
const getSaveLocationToPreserve = (
  xboxEditTime: Dayjs,
  steamEditTime: Dayjs
): KeepRemove => {
  if (xboxEditTime.isAfter(steamEditTime)) {
    return { keep: SaveFileTypes.xbox, remove: SaveFileTypes.steam };
  } else if (xboxEditTime.isBefore(steamEditTime)) {
    return { keep: SaveFileTypes.steam, remove: SaveFileTypes.xbox };
  } else {
    console.info(
      chalk.red(
        "These two files were modified at the exact same time and are presumed identical, exiting."
      )
    );
    exit(1);
  }
};

const renameOldFile = async (fileType: SaveFileTypes) => {
  const oldFileDetails = SaveFileDetails[fileType]; // await promises.rename();
  const newFileName =
    oldFileDetails.basename + `-backup-${dayjs().format("YYYYMMDD-HH-mm-ss")}`;

  console.warn(
    `Renaming your ${fileType} Save File:
${chalk.underline(oldFileDetails.basename)} -> ${chalk.underline(newFileName)}:

Full Path: 
${path.join(oldFileDetails.dirname, newFileName)}`
  );

  if (!isDryRun) {
    await promises.rename(
      SaveFileLocations[fileType],
      path.join(oldFileDetails.dirname, newFileName)
    );
  }
};

const copyDesiredSaveToUndesiredSaveLocation = async (desired: KeepRemove) => {
  console.warn(
    `I will now copy the file in:
${chalk.underline(SaveFileLocations[desired.keep])} 
to the file location:
${chalk.underline(SaveFileLocations[desired.remove])}`
  );
  if (!isDryRun) {
    await promises.copyFile(
      SaveFileLocations[desired.keep],
      SaveFileLocations[desired.remove]
    );
  }
};

const setupXboxSaveFileLocation = async () => {
  const basePath = SaveFileDetails[SaveFileTypes.xbox].dirname;
  const pathContents = await promises.readdir(basePath);
  const fileName = pathContents.find((item) => {
    return !item.includes("-") || !item.includes(".");
  });
  if (fileName) {
    console.log(
      `Found a matching file ${chalk.green(
        fileName
      )} in the xbox save directory`
    );
    const fullPath = path.join(basePath, fileName);

    SaveFileDetails[SaveFileTypes.xbox].basename = fileName;
    SaveFileLocations.xbox = fullPath;
    console.log(SaveFileLocations.xbox, SaveFileDetails[SaveFileTypes.xbox]);
  } else {
    console.warn(
      `Couldn't find a file in the xbox save directory that matches the save formatting.`
    );
    exit(2);
  }
  SaveFileLocations;
};

const main = async () => {
  await setupXboxSaveFileLocation();
  const xboxSaveInfo = await promises.lstat(SaveFileLocations.xbox);
  const steamSaveInfo = await promises.lstat(SaveFileLocations.steam);

  const xboxEditTime = getEditTime(xboxSaveInfo);
  const steamEditTime = getEditTime(steamSaveInfo);
  if (isDryRun) {
    console.log(chalk.blue("Running in DRY RUN MODE, your files are safe."));
  } else {
    console.log(
      chalk.red("Not in Dry Run mode, THIS WILL PERMANANTLY CHANGE FILES")
    );
  }

  console.log(
    `Found both save files. 

Xbox Last Edit Time: 
    ${chalk.magenta(xboxEditTime.format("MM/DD/YYYY HH:mm:ss"))}
Steam Last Edit Time:
    ${chalk.magenta(steamEditTime.format("MM/DD/YYYY HH:mm:ss"))}`
  );

  const comparisonResult = getSaveLocationToPreserve(
    xboxEditTime,
    steamEditTime
  );
  console.log(
    `We will keep your ${comparisonResult.keep} save file and replace your ${comparisonResult.remove} save file.`
  );
  const { yesno } = await prompt.get(property);
  if (yesno === "yes") {
    await renameOldFile(comparisonResult.remove);
    await copyDesiredSaveToUndesiredSaveLocation(comparisonResult);

    console.log("Success!");
  }
};

main();
