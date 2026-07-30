const str = "| Col 1 | Col 2 | \r\n|---|---|\r\n| A | B | \r\n| C | D |";

const regex = /(?:^|\n)[ \t]*(\|[^\n]+\|[ \t]*\r?(?:\n[ \t]*\|[-:\s|]+\|[ \t]*\r?)?(?:\n[ \t]*\|[^\n]+\|[ \t]*\r?)*)/g;

let match;
while ((match = regex.exec(str)) !== null) {
  console.log("MATCH:");
  console.log(match[1]);
}
