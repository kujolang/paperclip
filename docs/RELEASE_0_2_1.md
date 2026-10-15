# Kujo for Paperclip 0.2.1

Fixes a UI issue discovered while recording the real-host walkthrough: Ask your project successfully generated and retained an answer, but the following evidence refresh unmounted the panel and cleared the visible answer and citations. Same-task refreshes now preserve the panel. Switching company or entity still resets its private state.

This patch changes no worker capabilities, private storage format or bundled components. Existing 0.2.0 installations can use the normal host upgrade path, then reload the page. Users coming from 0.1.x must still follow the data-retaining reinstall guidance in the 0.2.0 release notes.

Regression coverage now models Paperclip's actual loading state during refresh; it verifies the answer and citations remain visible while refresh is pending and after completion, then disappear on company navigation.
