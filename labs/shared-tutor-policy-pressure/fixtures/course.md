# JavaScript object identity, aliasing, and shallow copying

An object has identity. A variable stores a reference to that object; assigning
that variable to another variable copies the reference, not the object.

```js
const original = { count: 1 };
const alias = original;
const copy = { ...original };

alias.count += 1;
console.log(original.count, alias.count, copy.count);
// 2 2 1
```

After `alias = original`, both variables point to the same object. Mutating
through either reference is visible through the other. The spread expression
creates a different outer object, so its outer `count` does not change here.

Spread is shallow. Nested objects can still be shared:

```js
const first = { profile: { score: 1 } };
const second = { ...first };

second.profile.score += 1;
console.log(first.profile.score, second.profile.score);
// 2 2
```

A useful prediction routine is: list the objects that were allocated, draw
which variables point to each object, then execute mutations one line at a
time. Object identity, not variable spelling, determines who observes a
mutation.

