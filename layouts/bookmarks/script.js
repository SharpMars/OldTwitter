let user = {};
let bookmarkCursor = null;
let end = false;
let linkColors = {};

function updateUserData() {
  API.account
    .verifyCredentials()
    .then(async (u) => {
      user = u;
      userDataFunction(u);
      renderUserData();
    })
    .catch((e) => {
      if (e === "Not logged in") {
        window.location.href = "/i/flow/login?newtwitter=true";
      }
      console.error(e);
    });
}
// Render
function renderUserData() {
  document.getElementById("user-name").innerText = user.name;
  document
    .getElementById("user-name")
    .classList.toggle("user-verified", user.verified);
  document
    .getElementById("user-name")
    .classList.toggle("user-protected", user.protected);

  document.getElementById("user-handle").innerText = `@${user.screen_name}`;
  document.getElementById("user-tweets").innerText = formatLargeNumber(
    user.statuses_count
  ).replace(/\s/g, ",");
  if (user.statuses_count >= 100000 && vars.showExactValues) {
    let style = document.createElement("style");
    style.innerText = `
            .user-stat-div > h1 { font-size: 18px !important }
            .user-stat-div > h2 { font-size: 13px !important }
        `;
    document.head.appendChild(style);
  }
  document.getElementById("user-following").innerText = formatLargeNumber(
    user.friends_count
  ).replace(/\s/g, ",");
  document.getElementById("user-followers").innerText = formatLargeNumber(
    user.followers_count
  ).replace(/\s/g, ",");
  document.getElementById("user-banner").src = user.profile_banner_url
    ? user.profile_banner_url
    : "https://abs.twimg.com/images/themes/theme1/bg.png";
  document.getElementById("user-avatar").src = `${
    user.default_profile_image && vars.useOldDefaultProfileImage
      ? chrome.runtime.getURL(
          `images/default_profile_images/default_profile_${
            Number(user.id_str) % 7
          }_normal.png`
        )
      : user.profile_image_url_https
  }`.replace("_normal.", "_400x400.");
  document.getElementById(
    "wtf-viewall"
  ).href = `/i/connect_people?newtwitter=true&user_id=${user.id_str}`;
  document.getElementById("user-avatar-link").href = `/${user.screen_name}`;
  document.getElementById("user-info").href = `/${user.screen_name}`;

  if (vars.enableTwemoji) twemoji.parse(document.getElementById("user-name"));

  if (document.getElementById("user-stats").clientWidth > 300) {
    let style = document.createElement("style");
    style.innerHTML = html`.user-stat-div > h2 { font-size: 10px !important }`;
    document.head.appendChild(style);
  }
}

async function renderBookmarks(cursor) {
  let bookmarks;
  let bookmarksContainer = document.getElementById("timeline");
  try {
    bookmarks = await API.bookmarks.get(cursor);
  } catch (e) {
    console.error(e);
    bookmarksContainer.innerHTML = html`<div style="color:var(--light-gray)">
      ${e}
    </div>`;
    document.getElementById("loading-box").hidden = true;
    return;
  }

  if (bookmarks.cursor) {
    bookmarkCursor = bookmarks.cursor;
  } else {
    end = true;
  }
  bookmarks = bookmarks.list;
  if (bookmarks.length === 0 && !cursor) {
    bookmarksContainer.innerHTML = html`<div style="color:var(--light-gray)">
      ${LOC.empty.message}
    </div>`;
    document.getElementById("delete-all").hidden = true;
    document.getElementById("loading-box").hidden = true;
    return;
  }
  if (bookmarks.length === 0 && cursor) {
    end = true;
    document.getElementById("loading-box").hidden = true;
    return;
  }
  for (let i = 0; i < bookmarks.length; i++) {
    let b = bookmarks[i];
    await appendTweet(b, bookmarksContainer, {
      bigFont: b.full_text && b.full_text.length < 75,
    });
  }
  document.getElementById("loading-box").hidden = true;
}
let loadingNewTweets = false;

setTimeout(async () => {
  if (!vars) {
    await loadVars();
  }

  // weird bug
  try {
    document
      .getElementById("wtf-refresh")
      .addEventListener("click", async () => {
        renderDiscovery(false);
      });
  } catch (e) {
    setTimeout(() => location.reload(), 2500);
    console.error(e);
    return;
  }
  document.addEventListener(
    "scroll",
    async () => {
      // loading new tweets
      if (
        window.innerHeight + window.scrollY >=
          document.body.offsetHeight - 500 &&
        !end
      ) {
        if (loadingNewTweets) return;
        loadingNewTweets = true;
        await renderBookmarks(bookmarkCursor);
        setTimeout(() => {
          loadingNewTweets = false;
        }, 250);
      }
    },
    { passive: true }
  );
  document.getElementById("delete-all").addEventListener("click", async () => {
    let modal = createModal(html`
      <p style="color:var(--almost-black);margin-top:0">
        ${LOC.delete_bookmarks.message}
      </p>
      <button class="nice-button" id="delete-all-confirm">
        ${LOC.delete_all.message}
      </button>
    `);
    modal
      .getElementsByClassName("nice-button")[0]
      .addEventListener("click", () => {
        API.bookmarks.deleteAll().then(() => {
          document.getElementById("timeline").innerHTML = html`<div
            style="color:var(--light-gray)"
          >
            ${LOC.empty.message}
          </div>`;
          document.getElementById("delete-all").hidden = true;
          modal.remove();
        });
      });
  });

  const timer = (ms) => new Promise((res) => setTimeout(res, ms));

  function getCircularReplacer() {
    const ancestors = [];
    return function (key, value) {
      if (typeof value !== "object" || value === null) {
        return value;
      }
      // `this` is the object that value is contained in,
      // i.e., its direct parent.
      while (ancestors.length > 0 && ancestors.at(-1) !== this) {
        ancestors.pop();
      }
      if (ancestors.includes(value)) {
        return "[Circular]";
      }
      ancestors.push(value);
      return value;
    };
  }

  document
    .getElementById("download-all")
    .addEventListener("click", async () => {
      let downloadBookmarks;
      let downloadBookmarkCursor = null;
      let downloadEnd = false;
      const downloadCap = document.getElementById("download-cap").valueAsNumber;

      try {
        downloadBookmarks = await API.bookmarks.get(downloadBookmarkCursor);
      } catch (e) {
        console.error(e);
        return;
      }

      downloadBookmarkCursor = downloadBookmarks.cursor;
      downloadBookmarks = downloadBookmarks.list;

      console.log("starting loop");

      while (
        !downloadEnd &&
        (downloadCap == -1 ? true : downloadBookmarks.length <= downloadCap)
      ) {
        console.log(
          `next iteration ${downloadBookmarkCursor}\ncurrent count: ${downloadBookmarks.length}\ndownload end: ${downloadEnd}`
        );
        await timer(5000 + Math.random() * 3000);
        let newBookmarks;
        try {
          newBookmarks = await API.bookmarks.get(downloadBookmarkCursor);
        } catch (e) {
          console.error(e);
          downloadEnd = true;
          break;
        }

        if (newBookmarks.cursor && newBookmarks.list.length > 0) {
          downloadBookmarkCursor = newBookmarks.cursor;
        } else {
          downloadEnd = true;
        }

        downloadBookmarks = downloadBookmarks.concat(newBookmarks.list);
      }

      if(downloadCap !== -1)
        downloadBookmarks = downloadBookmarks.slice(0, downloadCap);

      window.open(
        URL.createObjectURL(
          new Blob([JSON.stringify(downloadBookmarks, getCircularReplacer())], {
            type: "application/json",
          })
        )
      );
    });

  // Run
  updateUserData();
  renderDiscovery();
  renderTrends();
  renderBookmarks();
  setInterval(updateUserData, 60000 * 3);
  setInterval(() => renderDiscovery(false), 60000 * 15);
  setInterval(renderTrends, 60000 * 5);
}, 50);
