# quantumult-X-fenliu
这是用来网站分流的文件夹合集。

## List 编辑器

`large-editor.html` 是当前唯一维护的 List 编辑器实现。

`editor.html` 仅作为旧网址兼容入口，会自动跳转到 `large-editor.html`；请勿再次删除，避免已经保存或发布的 `/editor.html` 链接失效。

打开 `editor.html` 或 `large-editor.html` 后，最终都会进入新版大文件编辑器。编辑器可直接从仓库选择器中选择并自动读取，也可以手动填写 `用户名/仓库名` 或完整 GitHub URL。选择器会携带仓库默认分支；手动输入且分支留空时，编辑器会读取 GitHub 的 `default_branch`，失败后继续尝试 `main` 和 `master`。GitHub 匿名 API 限流时，内置公开仓库列表和公共文件索引回退仍可用于只读加载；授权后刷新选择器可显示令牌可访问的私有仓库，保存仍需要 Contents：Read and write 权限并重新读取文件。
