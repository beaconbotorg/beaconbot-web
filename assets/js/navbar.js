//      made with ❤️ by
//          __                              _____
//         / /______ _____  _______  __   _|__  /
//        / //_/ __ `/ __ \/ ___/ / / /  (_)/_ < 
//       / ,< / /_/ / /_/ (__  ) /_/ /  _ ___/ / 
//      /_/|_|\__,_/\____/____/\__,_/  (_)____/  

//      note..
//          - this code/file is protected by basic intellectual property rights, if found duplicated/reproduced without permission, legal action may occur.
//          - this was made for "Beacon Bot", only authorized for use on any subdomain/path associated with "kaosu.xyz" and "beaconbot.site"

document.addEventListener('DOMContentLoaded', () => {
  const navbar = document.getElementById('navbar');
  window.addEventListener('scroll', () => {
    navbar.classList.toggle('scrolled', window.scrollY > 50);
  });
});