import React, { useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { Button } from "./ui/button";
import {
  ConditionOptions,
  ListenerOptions,
  EventOptions,
  AccessoryOptions,
} from "../lib/nodeOptions";
import { Input } from "./ui/input";
import { Handle, Position } from "@xyflow/react";
import { IconEdit, IconArrowUpRight } from "@tabler/icons-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Textarea } from "./ui/textarea";

// Base node styles
const nodeBaseStyle =
  "px-4 py-3 shadow-lg rounded-lg border-2 min-w-[180px] bg-gray-900";
const selectedStyle = "border-white";
const unselectedStyle = "";

// Node border colors
const CONDITION_BORDER = "#e91e63"; // Pink/red
const LISTENER_BORDER = "#2196F3"; // Blue
const EVENT_BORDER = "#4caf50"; // Green
const ACCESSORY_BORDER = "#ff9800"; // Orange

// Condition Node Component
export const ConditionNode = ({ id, data, selected }) => {
  const [isDescriptionDialogOpen, setIsDescriptionDialogOpen] = useState(false);
  const [tempDescription, setTempDescription] = useState(
    data.description || ""
  );

  const handleTypeChange = (value) => {
    if (data.onTypeChange) {
      data.onTypeChange(id, value);
    }
  };

  const handleOpenDescriptionDialog = (e) => {
    e.stopPropagation();
    setTempDescription(data.description || "");
    setIsDescriptionDialogOpen(true);
  };

  const handleSaveDescription = () => {
    if (data.onDescriptionChange) {
      data.onDescriptionChange(id, tempDescription);
    }
    setIsDescriptionDialogOpen(false);
  };

  return (
    <>
      <div
        className={`${nodeBaseStyle} ${selected ? selectedStyle : ""}`}
        style={{
          borderColor: selected ? "#ffffff" : CONDITION_BORDER,
        }}
      >
        <div className="flex items-center justify-between mb-2">
          <div className="text-white font-semibold text-sm">Condition</div>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleOpenDescriptionDialog}
            className="h-5 w-5 text-gray-400 hover:text-white"
          >
            <IconEdit className="h-3 w-3" />
          </Button>
        </div>
        <Select
          value={data.condition_type || ""}
          onValueChange={handleTypeChange}
        >
          <SelectTrigger className="w-full bg-gray-800 border-gray-600 text-white text-xs h-8">
            <SelectValue placeholder="Select condition type" />
          </SelectTrigger>
          <SelectContent className="bg-gray-800 border-gray-600">
            {ConditionOptions.map((option) => (
              <SelectItem
                key={option}
                value={option}
                className="text-white hover:bg-gray-700 focus:bg-gray-700"
              >
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {data.description && (
          <div className="mt-2 text-gray-400 text-xs line-clamp-2">
            {data.description}
          </div>
        )}
        {/* Output handle - Condition connects to Listener */}
        <Handle
          type="source"
          position={Position.Right}
          className="w-3 h-3"
          style={{ backgroundColor: CONDITION_BORDER }}
        />
      </div>

      {/* Description Dialog */}
      <Dialog
        open={isDescriptionDialogOpen}
        onOpenChange={setIsDescriptionDialogOpen}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Condition Description</DialogTitle>
            <DialogDescription>
              Describe what should occur when this condition is met.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={tempDescription}
            onChange={(e) => setTempDescription(e.target.value)}
            placeholder="Describe the condition..."
            className="min-h-[100px] bg-gray-900 text-white border-gray-600"
          />
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsDescriptionDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button onClick={handleSaveDescription}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

// Listener Node Component
export const ListenerNode = ({ id, data, selected }) => {
  const [isDescriptionDialogOpen, setIsDescriptionDialogOpen] = useState(false);
  const [tempDescription, setTempDescription] = useState(
    data.description || ""
  );

  const handleTypeChange = (value) => {
    if (data.onTypeChange) {
      data.onTypeChange(id, value);
    }
  };

  const handleOpenDescriptionDialog = (e) => {
    e.stopPropagation();
    setTempDescription(data.description || "");
    setIsDescriptionDialogOpen(true);
  };

  const handleSaveDescription = () => {
    if (data.onDescriptionChange) {
      data.onDescriptionChange(id, tempDescription);
    }
    setIsDescriptionDialogOpen(false);
  };

  return (
    <>
      <div
        className={`${nodeBaseStyle} ${selected ? selectedStyle : ""}`}
        style={{
          borderColor: selected ? "#ffffff" : LISTENER_BORDER,
        }}
      >
        <div className="flex items-center justify-between mb-2">
          <div className="text-white font-semibold text-sm">Listener</div>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleOpenDescriptionDialog}
            className="h-5 w-5 text-gray-400 hover:text-white"
          >
            <IconEdit className="h-3 w-3" />
          </Button>
        </div>
        <Select
          value={data.listener_type || ""}
          onValueChange={handleTypeChange}
        >
          <SelectTrigger className="w-full bg-gray-800 border-gray-600 text-white text-xs h-8">
            <SelectValue placeholder="Select listener type" />
          </SelectTrigger>
          <SelectContent className="bg-gray-800 border-gray-600">
            {ListenerOptions.map((option) => (
              <SelectItem
                key={option}
                value={option}
                className="text-white hover:bg-gray-700 focus:bg-gray-700"
              >
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {data.description && (
          <div className="mt-2 text-gray-400 text-xs line-clamp-2">
            {data.description}
          </div>
        )}
        {/* Input handle - receives from Condition */}
        <Handle
          type="target"
          position={Position.Left}
          className="w-3 h-3"
          style={{ backgroundColor: LISTENER_BORDER }}
        />
        {/* Output handle - connects to Event */}
        <Handle
          type="source"
          position={Position.Right}
          className="w-3 h-3"
          style={{ backgroundColor: LISTENER_BORDER }}
        />
      </div>

      {/* Description Dialog */}
      <Dialog
        open={isDescriptionDialogOpen}
        onOpenChange={setIsDescriptionDialogOpen}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Listener Description</DialogTitle>
            <DialogDescription>
              Describe what should occur when this listener detects something.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={tempDescription}
            onChange={(e) => setTempDescription(e.target.value)}
            placeholder="Describe what to listen for..."
            className="min-h-[100px] bg-gray-900 text-white border-gray-600"
          />
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsDescriptionDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button onClick={handleSaveDescription}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

// Event Node Component
export const EventNode = ({ id, data, selected }) => {
  const [isConfigDialogOpen, setIsConfigDialogOpen] = useState(false);
  const [tempRecipient, setTempRecipient] = useState(data.recipient || "");
  const [tempNumber, setTempNumber] = useState(data.number || "");
  const [tempMessage, setTempMessage] = useState(data.message || "");

  const handleTypeChange = (value) => {
    if (data.onTypeChange) {
      data.onTypeChange(id, value);
    }
  };

  const handleOpenConfigDialog = (e) => {
    e.stopPropagation();
    setTempRecipient(data.recipient || "");
    setTempNumber(data.number || "");
    setTempMessage(data.message || "");
    setIsConfigDialogOpen(true);
  };

  const handleSaveConfig = () => {
    if (data.onConfigChange) {
      data.onConfigChange(id, {
        recipient: tempRecipient,
        number: tempNumber,
        message: tempMessage,
      });
    }
    setIsConfigDialogOpen(false);
  };

  const eventType = data.event_type || "";

  // Show different fields based on event type
  const showFields = () => {
    if (eventType === "Email") {
      return (
        <div className="mt-2 space-y-2">
          {data.recipient && (
            <div className="text-gray-400 text-xs">
              <span className="text-gray-500">To:</span> {data.recipient}
            </div>
          )}
          {data.message && (
            <div className="text-gray-400 text-xs line-clamp-2">
              {data.message}
            </div>
          )}
        </div>
      );
    } else if (eventType === "Text") {
      return (
        <div className="mt-2 space-y-2">
          {data.number && (
            <div className="text-gray-400 text-xs">
              <span className="text-gray-500">To:</span> {data.number}
            </div>
          )}
          {data.message && (
            <div className="text-gray-400 text-xs line-clamp-2">
              {data.message}
            </div>
          )}
        </div>
      );
    } else if (eventType === "Emergency") {
      return (
        <div className="mt-2">
          {data.message && (
            <div className="text-gray-400 text-xs line-clamp-2">
              {data.message}
            </div>
          )}
        </div>
      );
    }
    return null;
  };

  return (
    <>
      <div
        className={`${nodeBaseStyle} ${selected ? selectedStyle : ""}`}
        style={{
          borderColor: selected ? "#ffffff" : EVENT_BORDER,
        }}
      >
        <div className="flex items-center justify-between mb-2">
          <div className="text-white font-semibold text-sm">Event</div>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleOpenConfigDialog}
            className="h-5 w-5 text-gray-400 hover:text-white"
          >
            <IconEdit className="h-3 w-3" />
          </Button>
        </div>
        <Select value={eventType} onValueChange={handleTypeChange}>
          <SelectTrigger className="w-full bg-gray-800 border-gray-600 text-white text-xs h-8">
            <SelectValue placeholder="Select event type" />
          </SelectTrigger>
          <SelectContent className="bg-gray-800 border-gray-600">
            {EventOptions.map((option) => (
              <SelectItem
                key={option}
                value={option}
                className="text-white hover:bg-gray-700 focus:bg-gray-700"
              >
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {showFields()}
        {/* Input handle only - Event is terminal node */}
        <Handle
          type="target"
          position={Position.Left}
          className="w-3 h-3"
          style={{ backgroundColor: EVENT_BORDER }}
        />
      </div>

      {/* Config Dialog - Different fields based on event type */}
      <Dialog open={isConfigDialogOpen} onOpenChange={setIsConfigDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Configure {eventType} Event</DialogTitle>
            <DialogDescription>
              {eventType === "Email" && "Set recipient email and message"}
              {eventType === "Text" && "Set phone number and message"}
              {eventType === "Emergency" && "Set emergency message"}
              {!eventType && "Configure event details"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {eventType === "Email" && (
              <>
                <div>
                  <label className="text-sm text-gray-300 mb-1 block">
                    Recipient Email
                  </label>
                  <Input
                    type="email"
                    value={tempRecipient}
                    onChange={(e) => setTempRecipient(e.target.value)}
                    placeholder="recipient@example.com"
                    className="bg-gray-900 text-white border-gray-600"
                  />
                </div>
                <div>
                  <label className="text-sm text-gray-300 mb-1 block">
                    Message
                  </label>
                  <Textarea
                    value={tempMessage}
                    onChange={(e) => setTempMessage(e.target.value)}
                    placeholder="Email message..."
                    className="min-h-[100px] bg-gray-900 text-white border-gray-600"
                  />
                </div>
              </>
            )}
            {eventType === "Text" && (
              <>
                <div>
                  <label className="text-sm text-gray-300 mb-1 block">
                    Phone Number
                  </label>
                  <Input
                    type="tel"
                    value={tempNumber}
                    onChange={(e) => setTempNumber(e.target.value)}
                    placeholder="+1234567890"
                    className="bg-gray-900 text-white border-gray-600"
                  />
                </div>
                <div>
                  <label className="text-sm text-gray-300 mb-1 block">
                    Message
                  </label>
                  <Textarea
                    value={tempMessage}
                    onChange={(e) => setTempMessage(e.target.value)}
                    placeholder="Text message..."
                    className="min-h-[100px] bg-gray-900 text-white border-gray-600"
                  />
                </div>
              </>
            )}
            {eventType === "Emergency" && (
              <div>
                <label className="text-sm text-gray-300 mb-1 block">
                  Emergency Message
                </label>
                <Textarea
                  value={tempMessage}
                  onChange={(e) => setTempMessage(e.target.value)}
                  placeholder="Emergency message to send..."
                  className="min-h-[100px] bg-gray-900 text-white border-gray-600"
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsConfigDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button onClick={handleSaveConfig}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

// Accessory Node Component
export const AccessoryNode = ({ id, data, selected }) => {
  const handleTypeChange = (value) => {
    if (data.onTypeChange) {
      data.onTypeChange(id, value);
    }
  };

  const handleConfigClick = (e) => {
    e.stopPropagation();
    window.open(
      "https://globe-electric.com/pages/smart-faqs?filter.v.availability=1",
      "_blank"
    );
  };

  return (
    <div
      className={`${nodeBaseStyle} ${selected ? selectedStyle : ""}`}
      style={{
        borderColor: selected ? "#ffffff" : ACCESSORY_BORDER,
      }}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="text-white font-semibold text-sm">Accessory</div>
        <Button
          variant="ghost"
          size="icon"
          onClick={handleConfigClick}
          className="h-5 w-5 text-gray-400 hover:text-white"
          title="View setup guide"
        >
          <IconArrowUpRight className="h-3 w-3" />
        </Button>
      </div>
      <Select
        value={data.accessory_type || ""}
        onValueChange={handleTypeChange}
      >
        <SelectTrigger className="nodrag w-full bg-gray-800 border-gray-600 text-white text-xs h-8">
          <SelectValue placeholder="Select accessory type" />
        </SelectTrigger>
        <SelectContent className="bg-gray-800 border-gray-600">
          {AccessoryOptions.map((option) => (
            <SelectItem
              key={option}
              value={option}
              className="text-white hover:bg-gray-700 focus:bg-gray-700"
            >
              {option}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {/* Input handle - receives from Listener */}
      <Handle
        type="target"
        position={Position.Left}
        className="w-3 h-3"
        style={{ backgroundColor: ACCESSORY_BORDER }}
      />
    </div>
  );
};
