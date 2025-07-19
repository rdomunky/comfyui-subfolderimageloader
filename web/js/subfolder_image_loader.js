import { app } from "../../../scripts/app.js";
import { api } from "../../../scripts/api.js";

// Extension for SubfolderImageLoader dynamic input filtering
app.registerExtension({
    name: "comfyui.SubfolderImageLoader",
    
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name === "SubfolderImageLoader") {
            const originalNodeCreated = nodeType.prototype.onNodeCreated;
            
            nodeType.prototype.onNodeCreated = function() {
                const result = originalNodeCreated?.apply(this, arguments);
                
                // Setup widget callbacks after node is fully created
                setTimeout(() => {
                    const subfolderWidget = this.widgets?.find(w => w.name === "subfolder");
                    
                    if (subfolderWidget) {
                        const originalCallback = subfolderWidget.callback;
                        
                        subfolderWidget.callback = (value, ...args) => {
                            if (originalCallback) {
                                originalCallback.call(subfolderWidget, value, ...args);
                            }
                            
                            this.updateImageList(value);
                        };
                        
                        // Also run initial filtering based on current subfolder value
                        const currentSubfolder = subfolderWidget.value || "";
                        this.updateImageList(currentSubfolder);
                        
                    } else {
                        console.error("SubfolderImageLoader: Could not find subfolder widget!");
                    }
                }, 100);
                
                return result;
            };
            
            // Method to update image list based on selected subfolder
            nodeType.prototype.updateImageList = async function(selectedSubfolder) {
                try {
                    // Get the image widget
                    const imageWidget = this.widgets?.find(w => w.name === "image");
                    if (!imageWidget) {
                        return;
                    }
                    
                    // Fetch updated image list from the backend
                    const response = await fetch("/subfolder_loader/refresh", {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                        },
                        body: JSON.stringify({
                            node_id: this.id,
                            subfolder: selectedSubfolder || ""
                        })
                    });
                    
                    if (!response.ok) {
                        console.error("SubfolderImageLoader: Failed to refresh image list:", response.statusText);
                        return;
                    }
                    
                    const data = await response.json();
                    if (!data.success) {
                        console.error("SubfolderImageLoader: Server error:", data.error);
                        return;
                    }
                    
                    // Use the pre-filtered images from the server
                    const filteredImages = data.filtered_images || [];
                    
                    // Remove and recreate the image widget
                    const imageIndex = this.widgets.findIndex(w => w.name === "image");
                    if (imageIndex >= 0) {
                        // Store the old widget's callback for reference
                        const oldWidget = this.widgets[imageIndex];
                        const oldCallback = oldWidget.callback;
                        
                        // Remove the old widget
                        this.widgets.splice(imageIndex, 1);
                        
                        // Determine the new value - always use first image from filtered list
                        const newValue = filteredImages.length > 0 ? filteredImages[0] : "";
                        
                        // Create new widget with updated options
                        const newWidget = this.addWidget(
                            "combo",
                            "image", 
                            newValue,
                            (value) => {
                                // Call original callback if it existed
                                if (oldCallback) {
                                    oldCallback.call(newWidget, value);
                                }
                            },
                            { 
                                values: filteredImages.length > 0 ? filteredImages : [""]
                            }
                        );
                        
                        // Move the new widget to the correct position
                        if (imageIndex < this.widgets.length - 1) {
                            const widget = this.widgets.pop();
                            this.widgets.splice(imageIndex, 0, widget);
                        }
                        
                        // Force update the node's properties
                        this.setProperty("image", newValue);
                        
                        // Trigger the widget callback to ensure the change is registered
                        if (newWidget.callback) {
                            newWidget.callback(newValue);
                        }
                    }
                    
                    // Force UI update
                    // Note: ComfyUI has a quirk where combo widget visual updates sometimes require
                    // mouse movement to refresh the display. The functionality works correctly,
                    // but the visual update may be delayed until the next mouse interaction.
                    this.setDirtyCanvas(true, true);
                    
                } catch (error) {
                    console.error("SubfolderImageLoader: Error updating image list:", error);
                }
            };
            
            // Override the original getExtraMenuOptions to add refresh option
            const originalGetExtraMenuOptions = nodeType.prototype.getExtraMenuOptions;
            nodeType.prototype.getExtraMenuOptions = function(_, options) {
                const result = originalGetExtraMenuOptions?.apply(this, arguments) || [];
                
                options.push({
                    content: "🔄 Refresh Files",
                    callback: () => {
                        const subfolderWidget = this.widgets?.find(w => w.name === "subfolder");
                        const currentSubfolder = subfolderWidget?.value || "";
                        this.updateImageList(currentSubfolder);
                    }
                });
                
                return result;
            };
        }
    }
});