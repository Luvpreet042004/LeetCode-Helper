const vscode = require('vscode');
const axios = require('axios');
const path = require('path');
const { exec } = require('child_process');
const fs = require('fs');

function countEqualsInString(inputString) {
    return (inputString.match(/=/g) || []).length;
}

const GRAPHQL_ENDPOINT = "https://leetcode.com/graphql";

// Function to query LeetCode's API
async function queryLeetCodeAPI(query, variables) {
    try {
        const response = await axios.post(
            GRAPHQL_ENDPOINT,
            { query, variables },
            {
                headers: {
                    "Content-Type": "application/json",
                },
            }
        );
        return response.data;
    } catch (error) {
        vscode.window.showErrorMessage(`Error: ${error.message}`);
        return null;
    }
}

function extractSlug(url) {
    // Regular expression to match the problem slug
    const match = url.match(/leetcode\.com\/problems\/([^/]+)\//);
    return match ? match[1] : null;
}
// Function to fetch and display problem details
async function fetchProblemDetails() {
    const url = await vscode.window.showInputBox({
        prompt: 'Enter the problem slug (e.g., "two-sum")'
    });

    const titleSlug = extractSlug(url);

    if (!titleSlug) {
        vscode.window.showErrorMessage("Problem slug is required!");
        return;
    }

    const query = `
        query getProblemDetails($titleSlug: String!) {
            question(titleSlug: $titleSlug) {
                questionId
                title
                titleSlug
                content
                difficulty
                likes
                dislikes
                topicTags {
                    name
                }
                isPaidOnly
                exampleTestcases
            }
        }
    `;

    const variables = { titleSlug };
    const data = await queryLeetCodeAPI(query, variables);

    if (!data || !data.data || !data.data.question) {
        vscode.window.showErrorMessage("Failed to fetch problem details. Please check the problem slug or try again.");
        return;
    }

    const problem = data.data.question;

    const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

    if (!workspaceFolder) {
        vscode.window.showErrorMessage("No workspace folder found. Please open a folder in VS Code before running the command.");
        return;
    }

    const In = extractInputs(problem.content)

    const inputs = problem.exampleTestcases
    .split('\n')
    .filter(input => input.trim() !== ""); // Remove empty lines

    for (let i = 0; i < inputs.length; i++) {
        if (inputs[i].includes('"')) { 
            inputs[i] = inputs[i].replace(/"/g, ''); // Remove all occurrences of `"`
        }
    }

    const numOfInputs = countEqualsInString(In[0]); // Assuming the first input defines the structure
    const groupedInputs = [];

    // Group inputs based on the number of '=' (or terms in each input)
    for (let i = 0; i < inputs.length; i += numOfInputs) {
        const group = inputs.slice(i, i + numOfInputs).join('\n');
        groupedInputs.push(group);
    }

    // Save grouped inputs to files
    groupedInputs.forEach((input, index) => {
        const inputFilePath = path.join(workspaceFolder, `input_${index + 1}.txt`);
        fs.writeFileSync(inputFilePath, input.trim(), "utf-8");
    });


const outputs = extractOutputs(problem.content)
outputs.forEach((output, index) => {
    const inputFilePath = path.join(workspaceFolder, `output_${index + 1}.txt`);
    fs.writeFileSync(inputFilePath, output.trim(), "utf-8");
});

    // Open a webview to display the problem statement
    const panel = vscode.window.createWebviewPanel(
        "leetcodeHelper",
        `Problem: ${problem.title}`,
        vscode.ViewColumn.One,
        {
            enableScripts: true, // Allow JavaScript in the webview
        }
    );

    // Set the HTML content of the webview
    panel.webview.html = getWebviewContent(problem);

    createSolutionTemplate(problem);
}


// Function to parse example test cases
async function createSolutionTemplate(problem) {
    const language = await vscode.window.showQuickPick(["C++", "Python", "JavaScript"], {
        placeHolder: "Select your preferred programming language",
    });

    if (!language) {
        vscode.window.showErrorMessage("You must select a programming language to proceed.");
        return;
    }

    // Define solution templates for different languages
    const templates = {
        "C++": `
// Problem: ${problem.title}
// Difficulty: ${problem.difficulty}

#include <iostream>
using namespace std;

void solution() {
    // Your code here
}

int main() {
    solution();
    return 0;
}
`,
        Python: `# Problem: ${problem.title}\n# Difficulty: ${problem.difficulty}\n\ndef solution():\n    # Your code here\n    pass\n\nif __name__ == "__main__":\n    solution()\n`,
        JavaScript: `
// Problem: ${problem.title}
// Difficulty: ${problem.difficulty}

function solution() {
    // Your code here
}

solution();
`,
    };

    // Map language to file extensions
    const extensions = {
        "C++": "cpp",
        Python: "py",
        JavaScript: "js",
    };

    const solutionTemplate = templates[language];
    const fileExtension = extensions[language];

    // Ask the user where to save the file
    const uri = await vscode.window.showSaveDialog({
        defaultUri: vscode.Uri.file(`solution.${fileExtension}`),
        filters: {
            [language]: [fileExtension],
        },
    });

    if (!uri) {
        vscode.window.showErrorMessage("No file selected. Operation canceled.");
        return;
    }

    // Write the solution template to the file
    const contentBuffer = Buffer.from(solutionTemplate, "utf8");
    await vscode.workspace.fs.writeFile(uri, contentBuffer);

    // Open the newly created file
    const doc = await vscode.workspace.openTextDocument(uri);
    await vscode.window.showTextDocument(doc);

    vscode.window.showInformationMessage(`${language} template loaded successfully.`);
}

// Generate webview content
function getWebviewContent(problem) {
    return `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>${problem.title}</title>
            <style>
                body {
                    font-family: Arial, sans-serif;
                    padding: 20px;
                }
                h1 {
                    color: #333;
                }
                .difficulty {
                    font-size: 1.2em;
                    color: ${problem.difficulty === "Easy" ? "green" : problem.difficulty === "Medium" ? "orange" : "red"};
                }
                pre {
                    padding: 10px;
                    border-radius: 5px;
                    overflow-x: auto;
                }
            </style>
        </head>
        <body>
            <h1>${problem.title}</h1>
            <p class="difficulty">Difficulty: ${problem.difficulty}</p>
            <h2>Problem Statement</h2>
            <div>${problem.content}</div>
        </body>
        </html>
    `;
}

function extractInputs(problemDescription) {
    const inputPattern = /<strong>Input:<\/strong>\s*(.*?)\n/g;
    const inputs = [];
    let match;

    while ((match = inputPattern.exec(problemDescription)) !== null) {
        inputs.push(match[1].trim()); // Capture the input values
    }

    return inputs;
}
async function runTestCases() {
    const editor = vscode.window.activeTextEditor;

    if (!editor) {
        vscode.window.showErrorMessage('No active editor found.');
        return;
    }

    const filePath = editor.document.fileName;
    const language = path.extname(filePath).slice(1); // Get file extension (e.g., cpp, py, js)

    const testDir = path.join(path.dirname(filePath)); 
    if (!fs.existsSync(testDir)) {
        vscode.window.showErrorMessage(`Test directory not found: ${testDir}`);
        return;
    }
    // Correct directory for test cases
    const inputs = fs.readdirSync(testDir).filter(file => file.startsWith('input_'));
    const outputs = fs.readdirSync(testDir).filter(file => file.startsWith('output_'));

    if (inputs.length !== outputs.length) {
        vscode.window.showErrorMessage('Mismatch between input and output test cases.');
        return;
    }

    const results = [];
    for (let i = 0; i < inputs.length; i++) {
        const inputFile = path.join(testDir, `input_${i + 1}.txt`);
        const outputFile = path.join(testDir, `output_${i + 1}.txt`);

        const actualOutput = await executeCode(filePath, language, inputFile);
        const expectedOutput = fs.readFileSync(outputFile, 'utf8').trim();

        results.push({
            testCase: i + 1,
            status: actualOutput === expectedOutput ? 'Pass' : 'Fail',
            expected: expectedOutput,
            actual: actualOutput,
        });
    }

    displayResults(results);
}


  async function executeCode(filePath, language, inputFile) {
    return new Promise((resolve, reject) => {
      const commands = {
        cpp: `g++ ${filePath} -o solution && solution < ${inputFile}`,
        python: `python ${filePath} < ${inputFile}`,
        java: `javac ${filePath} && java Solution < ${inputFile}`,
        js: `node ${filePath} < ${inputFile}`,
      };
  
      const command = commands[language];
      if (!command) {
        vscode.window.showErrorMessage(`Unsupported language: ${language}`);
        reject();
      }
  
      exec(command, { cwd: path.dirname(filePath) }, (error, stdout, stderr) => {
        if (error) {
            reject(stderr || error.message);
        }
        resolve(stdout.trim());
    });
    
    });
  }

  function extractOutputs(html) {
    // Regex to capture all occurrences of <strong>Output:</strong> followed by the output value
    const regex = /<strong>Output:<\/strong>\s*([\w\[\]\-.,]+)/g;
    const outputs = [];
    let match;

    while ((match = regex.exec(html)) !== null) {
        outputs.push(match[1]); // Capture the output value
    }

    return outputs;
}

  function displayResults(results) {
    const outputChannel = vscode.window.createOutputChannel('CPH Results');
    outputChannel.clear();
    outputChannel.appendLine('Test Case Results:\n');
    results.forEach(result => {
      outputChannel.appendLine(`Test Case ${result.testCase}: ${result.status}`);
      if (result.status === 'Fail') {
        outputChannel.appendLine(`  Expected: ${result.expected}`);
        outputChannel.appendLine(`  Actual:   ${result.actual}`);
      }
      outputChannel.appendLine('');
    });
    outputChannel.show();
  }

function activate(context) {
    let disposable = vscode.commands.registerCommand('leetcode.queryProblem', fetchProblemDetails);
    context.subscriptions.push(disposable);

    let runTestCasesCmd = vscode.commands.registerCommand("leetcode.runTestCases", runTestCases);
    context.subscriptions.push(runTestCasesCmd);
}

function deactivate() {}

module.exports = {
    activate,
    deactivate
};
