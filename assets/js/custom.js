// // Set up canvas
// const canvas = document.createElement("canvas");
// document.body.appendChild(canvas);
// const ctx = canvas.getContext("2d");
// canvas.style.position = "fixed";
// canvas.style.bottom = "0";
// canvas.style.left = "0";
// canvas.style.pointerEvents = "none";  // Allow interaction with other elements

// // Canvas size
// canvas.width = window.innerWidth;
// canvas.height = 50; // A small height to cover the bottom of the screen

// // Adjust canvas size on window resize
// window.addEventListener("resize", () => {
//   canvas.width = window.innerWidth;
//   drawDots();
// });

// // Function to draw dots
// function drawDots() {
//   ctx.clearRect(0, 0, canvas.width, canvas.height); // Clear canvas before redrawing

//   const scrollY = window.scrollY; // Get current scroll position
//   const scrollHeight = document.documentElement.scrollHeight;
//   const viewportHeight = window.innerHeight;

//   // Gradual increase in density as you scroll
//   const densityFactor = Math.min(scrollY / (scrollHeight - viewportHeight), 1);  // Normalize scroll position between 0 and 1
  
//   // Define the maximum number of dots across the bottom of the screen
//   const maxDots = canvas.width; // Number of dots will be equal to screen width
//   const dotsForThisScroll = Math.floor(densityFactor * maxDots);  // Dots to draw based on scroll

//   // Draw the dots from left to right
//   for (let i = 0; i < dotsForThisScroll; i++) {
//     const x = i;  // x-coordinate of each dot
//     const y = canvas.height / 2;  // All dots will be aligned along the vertical center of the canvas (bottom of the screen)
//     ctx.beginPath();
//     ctx.arc(x, y, 2, 0, Math.PI * 2); // Draw small dots
//     ctx.fillStyle = "rgba(0, 0, 0, 0.2)"; // Less opaque (20% opacity)
//     ctx.fill();
//   }
// }

document.addEventListener('DOMContentLoaded', function () {
  const links = document.querySelectorAll('a[href]');
  links.forEach(link => {
      const href = link.getAttribute('href');
      
      // Check if the link is external
      if (href && !href.startsWith('/') && !href.startsWith('#') && !href.includes(window.location.origin)) {
          if (!link.hasAttribute('target')) {
              link.setAttribute('target', '_blank');
              link.setAttribute('rel', 'noopener noreferrer'); // For security reasons
          }
      }
  });
});

// don't display entire caption in tooltip
document.addEventListener('DOMContentLoaded', function() {
  const imageLinks = document.querySelectorAll('figure a');

  imageLinks.forEach(function(link) {
    const img = link.querySelector('img');
    
    if (img) {
      const originalTitle = link.getAttribute('title');  // Store the original caption (title)
      const altText = img.getAttribute('alt');  // Get the alt text for tooltip

      // When mouse enters, temporarily set the title to alt text (for tooltip)
      link.addEventListener('mouseenter', function() {
        link.setAttribute('title', altText);  // Tooltip shows alt text
      });

      // When mouse leaves, restore the original title (caption)
      link.addEventListener('mouseleave', function() {
        link.setAttribute('title', originalTitle);  // Restore caption in title
      });

      // Prevent any title change when the image is clicked
      link.addEventListener('click', function() {
        link.setAttribute('title', originalTitle);  // Keep the original title intact
      });
    }
  });
});


// slightly darken gallery images on hover
document.addEventListener('DOMContentLoaded', function() {
    const images = document.querySelectorAll('figure img');
    const captions = document.querySelectorAll('figcaption');  // Get all captions
  
    images.forEach(function(img) {
      // Add class to darken image on hover
      img.addEventListener('mouseenter', function() {
        img.classList.add('image-darken');
      });
  
      // Remove class to revert image when hover ends
      img.addEventListener('mouseleave', function() {
        img.classList.remove('image-darken');
      });
    });
  
    // Ensure captions are shown when the image is first loaded
    captions.forEach(function(caption) {
      caption.style.opacity = 1; // Ensure captions are visible initially
    });
  });

// filter buttons
document.addEventListener('DOMContentLoaded', function () {
  const filterButtons = document.querySelectorAll('#filter-buttons button');
  const galleryItems = document.querySelectorAll('figure a[data-tags]');

  filterButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const filter = button.getAttribute('data-filter');

      galleryItems.forEach((item) => {
        const tags = item.getAttribute('data-tags').split(',');

        // Show item if 'all' is selected or the filter matches one of the tags
        if (filter === 'all' || tags.includes(filter)) {
          item.style.display = 'block'; // Show the item
        } else {
          item.style.display = 'none'; // Hide the item
        }
      });
    });
  });
});


// only display filtered items in full screen gallery
let currentFilter = 'all'; // Default to showing all images

// Initialize Magnific Popup with a dynamic set of images
function initMagnificPopup(filtered = false) {
  const gallerySelector = filtered ? 'figure a[data-tags][style="display: block;"]' : 'figure a[data-tags]';
  const galleryItems = document.querySelectorAll(gallerySelector);

  // Destroy existing instance (if any) before reinitializing
  if ($.magnificPopup.instance.isOpen) {
    $.magnificPopup.close();
  }

  $(".image-popup").off('click').magnificPopup({
    type: "image",
    gallery: {
      enabled: true,
      navigateByImgClick: true,
      preload: [0, 1],
    },
    image: {
      tError: '<a href="%url%">Image #%curr%</a> could not be loaded.',
    },
    removalDelay: 1000,
    mainClass: "mfp-zoom-in",
    callbacks: {
      beforeOpen: function () {
        const clickedImage = this.st.el[0];
        const index = Array.from(galleryItems).indexOf(clickedImage);

        // Update the lightbox gallery with the correct set
        this.items = Array.from(galleryItems).map(item => ({
          src: item.getAttribute('href'),
          title: item.getAttribute('title'),
        }));

        // Start at the correct index
        this.index = index;
      },
    },
    closeOnContentClick: true,
    midClick: true,
  });
}

document.addEventListener('DOMContentLoaded', function () {
  const filterButtons = document.querySelectorAll('#filter-buttons button');
  const galleryItems = document.querySelectorAll('figure a[data-tags]');

  // Initial setup: Make sure the gallery is fully initialized before any filter is applied
  initMagnificPopup();

  filterButtons.forEach((button) => {
    button.addEventListener('click', () => {
      currentFilter = button.getAttribute('data-filter'); // Store the selected filter

      galleryItems.forEach((item) => {
        const tags = item.getAttribute('data-tags').split(',');

        // Show item if 'all' is selected or the filter matches one of the tags
        if (currentFilter === 'all' || tags.includes(currentFilter)) {
          item.style.display = 'block'; // Show the item
        } else {
          item.style.display = 'none'; // Hide the item
        }
      });

      // Reinitialize Magnific Popup
      if (currentFilter === 'all') {
        initMagnificPopup(false); // Reset to default (all images)
      } else {
        initMagnificPopup(true); // Initialize with the filtered images
      }
    });
  });
});
