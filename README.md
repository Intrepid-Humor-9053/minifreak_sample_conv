# [Minifreak sample conversion](https://mtizim.github.io/minifreak_sample_conv/)

## Attribution
Thanks to
[u/Intrepid-Humor-9053](https://www.reddit.com/user/Intrepid-Humor-9053) for the [original code](https://www.reddit.com/r/MiniFreak/comments/1l4vkww/bring_your_own_samples_to_minifreak_app_sample/) and instructions below.

Consider getting him a beer on [Gumroad](https://paulzett.gumroad.com/l/usersampleimporter)

### 🪄 Step-by-Step Workflow

1. **Convert Your Files**
   - Drag & drop your WAV, AIFF, or MP3 files into the app.
   - Optionally trim and preview before converting.
   - Files will be saved as `.raw12b` format.

2. **Copy to Factory Sample Folder**
   - Place your converted files into this directory:
     ```
     /Library/Arturia/Samples/MiniFreak V/Factory/Samples/Factory
     ```
     > 📁 This is the (standard) Factory Sample folder used by MiniFreak V.

3. **Sync to Hardware**
   - Connect your MiniFreak to your computer via USB.
   - Open the **MiniFreak standalone app, NOT PLUGIN**.
   - A prompt will appear to **synchronize samples** — proceed with it.
   - Your new samples will be transferred to the hardware.

4. **Play Your Samples**
   - The new samples will now appear inside MiniFreak’s **Factory** list.
   - You can use them in the **Sampler** or **Grain Engine**.

---

> ⚠️ **Backup First!**
> Before adding or replacing samples, make sure to **backup your current MiniFreak state and sample library** — just in case.

> 🧪 **Test Gradually**
> While this tool has worked reliably in our testing, it's always a good idea to:
> - Add samples in **small batches**.
> - Test syncing and playback between each batch.

This is **not an official Arturia tool** — it's a personal project made out of passion (and a bit of frustration) with the lack of sample import in firmware 4.0 😉

Enjoy crafting your own sound universe!
