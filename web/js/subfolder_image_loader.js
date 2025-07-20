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
                        
                        // Flag to prevent concurrent updateImageList calls
                        this._updatingImageList = false;
                        
                        // Track all pending image loads so we can cancel them
                        this._pendingImages = [];
                        
                        // Disable ComfyUI's automatic image loading to prevent interference
                        this.imageIndex = null; // Remove automatic image loading
                        
                        // Override onLoaded function to prevent automatic loading
                        this.onLoaded = function() {
                            // Do nothing - prevent ComfyUI's automatic image loading
                        };
                        
                        // Simple image array for preview functionality
                        this.imgs = [];
                        
                        // showImage function with delayed updates to override ComfyUI's automatic loading
                        this.showImage = function(name) {
                            // Cancel ALL previous pending image loads
                            this._pendingImages.forEach(pendingImg => {
                                pendingImg.onload = null;
                                pendingImg.onerror = null;
                                pendingImg.src = ''; // Stop loading
                            });
                            this._pendingImages = [];
                            
                            const img = new Image();
                            
                            // Add to pending list
                            this._pendingImages.push(img);
                            
                            img.onload = () => {
                                // Only update if this image is still in the pending list (not cancelled)
                                if (this._pendingImages.includes(img)) {
                                    // Apply multiple delayed updates to override ComfyUI's persistent automatic loading
                                    [100, 200, 300].forEach(delay => {
                                        setTimeout(() => {
                                            // Check if this image is still the most recent one
                                            if (this._pendingImages.includes(img)) {
                                                this.imgs = [img];
                                                app.graph.setDirtyCanvas(true);
                                            }
                                        }, delay);
                                    });
                                    
                                    // Remove from pending list after all delays
                                    setTimeout(() => {
                                        const index = this._pendingImages.indexOf(img);
                                        if (index > -1) {
                                            this._pendingImages.splice(index, 1);
                                        }
                                    }, 350);
                                }
                            };

                            if (name) {
                                let subfolder = this.widgets?.find(w => w.name === "subfolder")?.value ?? "";
                                // Extract filename from path if needed
                                const filename = name.includes('/') ? name.split('/').pop() : name;
                                const imageUrl = api.apiURL(`/view?filename=${encodeURIComponent(filename)}&type=input&subfolder=${subfolder}${app.getPreviewFormatParam()}${app.getRandParam()}`);
                                img.src = imageUrl;
                            } else {
                                this.imgs = [];
                                app.graph.setDirtyCanvas(true);
                            }
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
                // Prevent concurrent updateImageList calls
                if (this._updatingImageList) {
                    return;
                }
                
                try {
                    // Set flag to indicate we're updating the list programmatically
                    this._updatingImageList = true;
                    // Get the image widget
                    const imageWidget = this.widgets?.find(w => w.name === "image");
                    if (!imageWidget) {
                        this._updatingImageList = false;
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
                        this._updatingImageList = false;
                        return;
                    }
                    
                    const data = await response.json();
                    if (!data.success) {
                        console.error("SubfolderImageLoader: Server error:", data.error);
                        this._updatingImageList = false;
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
                                // Always show image preview when widget value changes
                                if (this.showImage) {
                                    this.showImage(value);
                                }
                                
                                // Call original callback if it existed
                                if (oldCallback) {
                                    oldCallback.call(newWidget, value);
                                }
                            },
                            { 
                                values: filteredImages.length > 0 ? filteredImages : [""],
                                image_upload: true
                            }
                        );
                        
                        // Move the new widget to the correct position
                        if (imageIndex < this.widgets.length - 1) {
                            const widget = this.widgets.pop();
                            this.widgets.splice(imageIndex, 0, widget);
                        }
                        
                        // Force update the node's properties
                        this.setProperty("image", newValue);
                        
                        // Use requestAnimationFrame for initial image display
                        requestAnimationFrame(() => {
                            if (newValue && this.showImage) {
                                this.showImage(newValue);
                            }
                        });
                    }
                    
                    // Force UI update
                    // Note: ComfyUI has a quirk where combo widget visual updates sometimes require
                    // mouse movement to refresh the display. The functionality works correctly,
                    // but the visual update may be delayed until the next mouse interaction.
                    this.setDirtyCanvas(true, true);
                    
                } catch (error) {
                    console.error("SubfolderImageLoader: Error updating image list:", error);
                } finally {
                    // Always clear the flag when done
                    this._updatingImageList = false;
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