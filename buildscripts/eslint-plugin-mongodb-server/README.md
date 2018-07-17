# eslint-plugin-mongodb-server

Custom ESlint rules for MongoDB's JavaScript integration tests.

## Installation

You'll first need to install [ESLint](http://eslint.org):

```
$ npm i eslint --save-dev
```

Next, install `eslint-plugin-mongodb-server`:

```
$ npm install eslint-plugin-mongodb-server --save-dev
```

**Note:** If you installed ESLint globally (using the `-g` flag) then you must also install `eslint-plugin-mongodb-server` globally.

## Usage

Add `mongodb-server` to the plugins section of your `.eslintrc` configuration file. You can omit the `eslint-plugin-` prefix:

```json
{
    "plugins": [
        "mongodb-server"
    ]
}
```


Then configure the rules you want to use under the rules section.

```json
{
    "rules": {
        "mongodb-server/rule-name": 2
    }
}
```

## Supported Rules

* Fill in provided rules here





