---
title: "How I replaced my existing GitHub pages website with a Jekyll site"
categories:
  - Blog
tags:
  - trial and error
  - how to
---

I've had a personal website hosted on GitHub pages for 5-ish years now. I had started out with a simple html template and then tweaked things as I went along (not unlike my Myspace days). Unfortunately, over the years this meant I'd built up a monster of circularly-referenced css and html and copy-pasting html every time I wanted to add a sub-page to my site (also not unlike the Myspace days). 
After talking about it for a while, I finally decided to put in some effort and replace my sprawling empire of html and css bloat with a _jekyll_ website. Markdown! We love markdown! Here's how it went.

If you want to skip the description of my thought process/struggles, [click here](#the-recipe).

### 1. Decide on a template and build your site locally
I looked through a bunch of templates and I found [one I liked](https://github.com/mmistakes/minimal-mistakes){:target="_blank"}, with great documentation. _Okay,_ I said to myself. I'll just make a few tweaks and we'll be golden. 

So, I cloned the starter template, picked a skin I liked, customized it a bit further, and then changed the settings in `config.yml`. I edited the author info, summary, links, favicons. I then ran a simple
```ruby
bundle exec jekyll serve
```
in my terminal, which built the `_site` directory, and all my changes started being reflected in my local server tab I had opened at `127.0.0.1:4000`. 

### 2. Customize the defaults
I replaced the default `index.md` with a gallery view, and removed a few placeholder options. I then replaced the sample posts with my own content and got Claude's help on building filter buttons in `custom.js` which I hooked in. (For the custom js code to be applied, I had to add in the `_layouts` directory with a `home.html` file to accomplish this. I'm still not sure this was the completely right way to do it, but as far as I can tell, it worked).

Long story short - edit your scss and js to your heart's content and the local page will update every time you add or remove a file or edit code and save your work. The only time you have to rebuild it from scratch is after editing the `config.yml` file. (You may also have to rebuild it if you see random weird behavior - I was seeing some hard-to-pin-down bugs with my custom code, which went away once the website was properly rebuilt.)

### 3. Replace the existing website content with the jekyll site
Now we get to the fun part: actually launching the website. I read [github's](https://docs.github.com/en/pages/setting-up-a-github-pages-site-with-jekyll/creating-a-github-pages-site-with-jekyll){:target="_blank"} instructions on how to do this but I'll be honest: I didn't really understand them. I got to steps 5-6 on 'publishing sources' and felt a sense of defeat. I knew I could always revert to my previous commit, but I didn't love the idea of trial-and-erroring a live site.

I also didn't want to interact with my site through [github only](https://docs.github.com/en/pages/setting-up-a-github-pages-site-with-jekyll/adding-content-to-your-github-pages-site-using-jekyll){:target="_blank"}. Here's how far I got:
- I understood I could just paste the contents of the generated `_site` folder into my `username.github.io` repo, which would replace my previous html and css files. But this defeats the purpose of the jekyll site - every time I'd add a post or change a line of code, I'd have to rebuild the site locally, copy, paste, commit, push. Obviously this wasn't the way to go.
- I wanted to avoid the github-based approach linked above. I'm much more comfortable with command line git and I wanted to work on files locally before pushing to remote.
- This made me realize I'd have to use _GitHub actions_. I know on a rational level that there's nothing to really be scared of - basically the worst thing that can happen is you have to revert and remove it. But I find it intimidating to give up that level of control to automation when, to be honest, I don't really understand it. 
Basically, this is what I think github actions are: 
![severance gif](https://y.yarn.co/90a8b80e-278e-4aad-a138-43a005b931fe_text.gif)

I found this [starter workflow](https://github.com/actions/starter-workflows/blob/main/pages/jekyll.yml){:target="_blank"} for jekyll pages which felt like a step in the right direction, but I ended up again leaning on Claude for help to make sure I wasn't botching anything. I got a reassuringly similar [workflow](https://github.com/ivabrunec/ivabrunec.github.io/blob/master/.github/workflows/jekyll-gh-pages.yml){:target="_blank"} in return. 

Here's the tl;dr (but thank you if you _did_ read):

##### The recipe
1. Pick a template you like and clone it. You can replace the contents of your _username.github.io_ repo right away, but I preferred to keep it separate until I was done editing so I could commit my changes. 
2. Copy the _entire_ contents of your in-development repo over to your _username.github.io_ repo. The `_config.yml` file should be at the root of this directory. 
3. Create a `.github/workflows/` folder within your repo, and save your jekyll workflow `yml` file in it (like the example starter file linked above).
This is an example of what the directory structure should look like: 
```ruby
username.github.io/
├── _data/
├── _posts/
├── assets/
├── .github/
│   └── workflows/
│       └── jekyll-gh-pages.yml
├── _config.yml
├── Gemfile
├── Gemfile.lock
└── .gitignore
```
4. Before you push, ensure that the `_site` directory is in `.gitignore`. It was there by default in the template I used, but worth double checking.
5. Commit & push.

Once you refresh your repo on GitHub, you'll see a little yellow dot while the site is building. Hopefully, it turns into a green tick once the workflow is done running. Unfortunately I don't have advice on debugging because the GitHub gods blessed me with an error-free process this time. 

Assuming the tick is there, congrats! Now any time you add a post or change anything in your code, all you need to do is push to remote and the site will be rebuilt for you. 
